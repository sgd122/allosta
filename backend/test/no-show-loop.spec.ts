import { INestApplication } from '@nestjs/common';
import { BookingStatus, SubjectType } from '@prisma/client';
import request from 'supertest';
import { BookingService } from '../src/booking/booking.service';
import { ConsultationService } from '../src/consultation/consultation.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  bootTestApp,
  cleanupSeeded,
  seedIsolated,
  SeededData,
} from './helpers/test-app';

/**
 * No-show loop integration tests — AC-N2, AC-N5 (a)-(e), AC-N6.
 *
 * Key discipline (plan §Principle 5):
 * - Sweeps are called DIRECTLY on BookingService, never via the live @Interval.
 * - Past slots are created inline per test to guarantee endAt < now.
 * - All asserts run under seedIsolated islands (scope=own determinism).
 */
describe('No-show loop (AC-N2, AC-N5, AC-N6)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bookingService: BookingService;
  let consultationService: ConsultationService;
  let island: SeededData;
  let islandB: SeededData; // for ownership RBAC test

  beforeAll(async () => {
    const ctx = await bootTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    bookingService = app.get(BookingService);
    consultationService = app.get(ConsultationService);
    island = await seedIsolated(prisma, ctx.signToken, { slotCount: 2 });
    islandB = await seedIsolated(prisma, ctx.signToken, { slotCount: 1 });
  });

  afterAll(async () => {
    await cleanupSeeded(prisma, island);
    await cleanupSeeded(prisma, islandB);
    await app.close();
  });

  // ── Helper: create a past slot (endAt < now) for an island ──────────────
  // Each call allocates a DISTINCT, non-overlapping 1h band stepping further into
  // the past. This keeps every slot strictly past (endAt < now) while ensuring
  // two past bookings for the SAME customer never share a time window — otherwise
  // the customer-no-overlap GiST constraint (ADR 0015) would (correctly) reject
  // the second ACTIVE booking these no-show fixtures create for one customer.
  let pastSlotSeq = 0;

  async function createPastSlot(counselorId: string): Promise<string> {
    pastSlotSeq += 1;
    // Each band is a 1h slot separated by a 1h gap (2h stride) so adjacent bands
    // can never touch — even with a few ms of Date.now() drift between calls —
    // and thus never overlap. Frozen base avoids drift between the two now() reads.
    const base = Date.now() - 60_000;
    const endAt = new Date(base - pastSlotSeq * 2 * 60 * 60 * 1000);
    const startAt = new Date(endAt.getTime() - 60 * 60 * 1000);
    const slot = await prisma.availabilitySlot.create({
      data: { counselorId, startAt, endAt, isOpen: true },
    });
    return slot.id;
  }

  async function createBookingOnSlot(
    slotId: string,
    customerId: string,
    status: BookingStatus,
  ): Promise<string> {
    // Mirror the denormalized slot window the service sets (ADR 0015).
    const slot = await prisma.availabilitySlot.findUniqueOrThrow({
      where: { id: slotId },
      select: { startAt: true, endAt: true },
    });
    const booking = await prisma.booking.create({
      data: {
        slotId,
        customerId,
        subjectType: SubjectType.CUSTOMER,
        subjectId: customerId,
        status,
        slotStartAt: slot.startAt,
        slotEndAt: slot.endAt,
      },
    });
    return booking.id;
  }

  // ── AC-N2: createRecord transitions CONFIRMED → COMPLETED ───────────────

  describe('AC-N2: createRecord regression', () => {
    it('transitions a CONFIRMED booking to COMPLETED when a record is created', async () => {
      // Arrange: CONFIRMED booking on a future slot (island already has future slots)
      const slotId = island.slotIds[0];
      const bookingId = await createBookingOnSlot(
        slotId,
        island.customerId,
        BookingStatus.CONFIRMED,
      );

      // Act
      await consultationService.createRecord(island.counselorId, {
        bookingId,
        summary: 'test notes',
        recommendation: '권고 사항',
        actions: [],
        outcome: 'EXPLAINED' as any,
        interestedProductIds: [],
        metricRefs: [],
      });

      // Assert
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { status: true },
      });
      expect(booking?.status).toBe(BookingStatus.COMPLETED);
    });

    it('rejects a second record on the same booking (unique bookingId guard)', async () => {
      const slotId = island.slotIds[1];
      const bookingId = await createBookingOnSlot(
        slotId,
        island.customerId,
        BookingStatus.CONFIRMED,
      );

      const dto = {
        bookingId,
        summary: 'first record',
        recommendation: '권고 사항',
        actions: [],
        outcome: 'GUIDED' as any,
        interestedProductIds: [],
        metricRefs: [],
      };

      // First record succeeds
      await consultationService.createRecord(island.counselorId, dto);

      // Second record must be rejected
      await expect(
        consultationService.createRecord(island.counselorId, {
          ...dto,
          summary: 'duplicate',
        }),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  // ── AC-N5(a): CONFIRMED + no record + past slot → NO_SHOW ───────────────

  describe('AC-N5(a): sweep marks unrecorded CONFIRMED past booking NO_SHOW', () => {
    it('transitions CONFIRMED + past slot + no record → NO_SHOW', async () => {
      const slotId = await createPastSlot(island.counselorId);
      const bookingId = await createBookingOnSlot(
        slotId,
        island.customerId,
        BookingStatus.CONFIRMED,
      );

      const count = await bookingService.sweepNoShows();

      expect(count).toBeGreaterThanOrEqual(1);
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { status: true },
      });
      expect(booking?.status).toBe(BookingStatus.NO_SHOW);
    });
  });

  // ── AC-N5(b): recorded booking ends up COMPLETED (from record-create tx) ─

  describe('AC-N5(b): recorded booking stays COMPLETED after sweep', () => {
    it('a COMPLETED booking (from record creation) is not touched by sweepNoShows', async () => {
      const slotId = await createPastSlot(island.counselorId);
      const bookingId = await createBookingOnSlot(
        slotId,
        island.customerId,
        BookingStatus.CONFIRMED,
      );

      // Create record — transitions booking to COMPLETED atomically
      await consultationService.createRecord(island.counselorId, {
        bookingId,
        summary: 'session notes',
        recommendation: '권고 사항',
        actions: [],
        outcome: 'PURCHASED' as any,
        interestedProductIds: [],
        metricRefs: [],
      });

      // Sweep must not touch a COMPLETED booking (status-guard: where status=CONFIRMED)
      await bookingService.sweepNoShows();

      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { status: true },
      });
      expect(booking?.status).toBe(BookingStatus.COMPLETED);
    });
  });

  // ── AC-N5(c): record committed before sweep — sweep leaves COMPLETED ─────

  describe('AC-N5(c): status-guard — concurrent record wins over sweep', () => {
    it('a booking already COMPLETED is not flipped to NO_SHOW by sweepNoShows', async () => {
      const slotId = await createPastSlot(island.counselorId);
      // Insert directly as COMPLETED to simulate record-create committed first
      const bookingId = await createBookingOnSlot(
        slotId,
        island.customerId,
        BookingStatus.COMPLETED,
      );

      await bookingService.sweepNoShows();

      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { status: true },
      });
      expect(booking?.status).toBe(BookingStatus.COMPLETED);
    });
  });

  // ── AC-N5(d): counselor corrects NO_SHOW → COMPLETED via PATCH ──────────

  describe('AC-N5(d): counselor manual override NO_SHOW → COMPLETED', () => {
    it('PATCH /bookings/:id/attendance corrects NO_SHOW to COMPLETED', async () => {
      const slotId = await createPastSlot(island.counselorId);
      const bookingId = await createBookingOnSlot(
        slotId,
        island.customerId,
        BookingStatus.NO_SHOW,
      );

      const res = await request(app.getHttpServer())
        .patch(`/bookings/${bookingId}/attendance`)
        .set('Authorization', `Bearer ${island.counselorToken}`)
        .send({ status: BookingStatus.COMPLETED });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(BookingStatus.COMPLETED);
    });

    it('PATCH /bookings/:id/attendance can also set COMPLETED → NO_SHOW', async () => {
      const slotId = await createPastSlot(island.counselorId);
      const bookingId = await createBookingOnSlot(
        slotId,
        island.customerId,
        BookingStatus.COMPLETED,
      );

      const res = await request(app.getHttpServer())
        .patch(`/bookings/${bookingId}/attendance`)
        .set('Authorization', `Bearer ${island.counselorToken}`)
        .send({ status: BookingStatus.NO_SHOW });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(BookingStatus.NO_SHOW);
    });

    it('rejects invalid attendance status values', async () => {
      const slotId = await createPastSlot(island.counselorId);
      const bookingId = await createBookingOnSlot(
        slotId,
        island.customerId,
        BookingStatus.CONFIRMED,
      );

      const res = await request(app.getHttpServer())
        .patch(`/bookings/${bookingId}/attendance`)
        .set('Authorization', `Bearer ${island.counselorToken}`)
        .send({ status: BookingStatus.CANCELLED }); // not allowed

      expect(res.status).toBe(400);
    });
  });

  // ── AC4/AC14: NO_SHOW bookings remain visible on the counselor schedule ──

  describe('counselor schedule surfaces NO_SHOW bookings', () => {
    it('includes a NO_SHOW booking with its status so missed sessions stay reviewable', async () => {
      const slotId = await createPastSlot(island.counselorId);
      const bookingId = await createBookingOnSlot(
        slotId,
        island.customerId,
        BookingStatus.NO_SHOW,
      );

      const schedule = await consultationService.getCounselorSchedule(
        island.counselorId,
      );

      const entry = schedule.find((e) => e.bookingId === bookingId);
      expect(entry).toBeDefined();
      expect(entry?.status).toBe(BookingStatus.NO_SHOW);
    });
  });

  // ── AC-N5(e): RBAC — other counselor → 403 ──────────────────────────────

  describe('AC-N5(e): RBAC ownership — foreign counselor gets 403', () => {
    it('islandB counselor cannot set attendance on islandA booking', async () => {
      const slotId = await createPastSlot(island.counselorId);
      const bookingId = await createBookingOnSlot(
        slotId,
        island.customerId,
        BookingStatus.CONFIRMED,
      );

      const res = await request(app.getHttpServer())
        .patch(`/bookings/${bookingId}/attendance`)
        .set('Authorization', `Bearer ${islandB.counselorToken}`)
        .send({ status: BookingStatus.NO_SHOW });

      expect(res.status).toBe(403);
    });
  });

  // ── AC-N6: stale PENDING bookings → CANCELLED ───────────────────────────

  describe('AC-N6: stale PENDING disposal', () => {
    it('sweepStalePending cancels past PENDING bookings', async () => {
      const slotId = await createPastSlot(island.counselorId);
      const bookingId = await createBookingOnSlot(
        slotId,
        island.customerId,
        BookingStatus.PENDING,
      );

      const count = await bookingService.sweepStalePending();

      expect(count).toBeGreaterThanOrEqual(1);
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { status: true },
      });
      expect(booking?.status).toBe(BookingStatus.CANCELLED);
    });

    it('sweepStalePending does not touch future PENDING bookings', async () => {
      // island.slotIds are future — book one and confirm sweep leaves it alone
      const futureBookingId = await createBookingOnSlot(
        island.slotIds[0],
        island.customerId,
        BookingStatus.PENDING,
      );

      const countBefore = await bookingService.sweepStalePending();
      // countBefore may be >0 from other slots in the DB — we don't assert exact
      // count here, only that our specific future booking is untouched.
      void countBefore; // suppress unused warning

      const booking = await prisma.booking.findUnique({
        where: { id: futureBookingId },
        select: { status: true },
      });
      expect(booking?.status).toBe(BookingStatus.PENDING);

      // Clean up to avoid interfering with other tests
      await prisma.booking.delete({ where: { id: futureBookingId } });
    });
  });
});
