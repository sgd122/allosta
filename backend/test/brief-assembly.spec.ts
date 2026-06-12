import { INestApplication } from '@nestjs/common';
import {
  BookingStatus,
  BriefGuidanceStatus,
  FamilyLinkStatus,
  SubjectType,
} from '@prisma/client';
import request from 'supertest';
import { ConsultationService } from '../src/consultation/consultation.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  bootTestApp,
  cleanupSeeded,
  seedIsolated,
  SeededData,
} from './helpers/test-app';

/**
 * Pre-consultation brief assembly + ownership + briefOpenedAt idempotency
 * (AC-P1/AC-P2/AC-P7 marker).
 *
 * - AC-P1: deterministic assembly — indicators sorted metricKey asc, pastRecords
 *   createdAt desc, ACCEPTED family context, concern surfaced; identical input →
 *   identical output.
 * - AC-P2: only the assigned counselor may open the brief (foreign → 403,
 *   unauthenticated → 401).
 * - AC-P7 marker (M3): briefOpenedAt is set on first open and a second sequential
 *   open leaves the timestamp unchanged (DB-idempotent conditional updateMany).
 */
describe('Pre-consultation brief (AC-P1/AC-P2/AC-P7 marker)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let consultationService: ConsultationService;
  let islandA: SeededData;
  let islandB: SeededData; // foreign counselor for ownership

  beforeAll(async () => {
    const ctx = await bootTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    consultationService = app.get(ConsultationService);
    islandA = await seedIsolated(prisma, ctx.signToken, { slotCount: 4 });
    islandB = await seedIsolated(prisma, ctx.signToken, { slotCount: 1 });
  });

  afterAll(async () => {
    await cleanupSeeded(prisma, islandA);
    await cleanupSeeded(prisma, islandB);
    await app.close();
  });

  // Creates a fresh future slot + booking for islandA's subject. A dedicated
  // slot per booking avoids the partial unique index (booking_slot_active_unique)
  // that bars two active bookings on one slot, so tests never collide.
  let slotSeq = 0;
  async function freshBooking(
    status: BookingStatus,
    concern?: string,
    subjectId?: string,
  ): Promise<string> {
    slotSeq += 1;
    const startAt = new Date(Date.now() + (100 + slotSeq) * 24 * 60 * 60 * 1000);
    const slot = await prisma.availabilitySlot.create({
      data: {
        counselorId: islandA.counselorId,
        startAt,
        endAt: new Date(startAt.getTime() + 60 * 60 * 1000),
        isOpen: true,
      },
    });
    const booking = await prisma.booking.create({
      data: {
        slotId: slot.id,
        customerId: islandA.customerId,
        subjectType: SubjectType.CUSTOMER,
        // subjectId defaults to the applicant (self-consultation); pass a linked
        // relative's id to model a family-data consultation.
        subjectId: subjectId ?? islandA.customerId,
        status,
        ...(concern !== undefined && { concern }),
      },
    });
    return booking.id;
  }

  // ── AC-P1: deterministic assembly + field correctness ──────────────────────

  describe('AC-P1: deterministic assembly', () => {
    it('assembles indicators (metricKey asc) + concern, and SUPPRESSES family for a self-consultation; identical input → identical output', async () => {
      // A second test result for the same subject so multiple metrics surface.
      await prisma.testResult.create({
        data: {
          subjectType: SubjectType.CUSTOMER,
          subjectId: islandA.customerId,
          serviceType: 'sleep',
          metrics: { alpha_wave: 12, zeta_index: 88 },
        },
      });

      // An ACCEPTED family member for context.
      const relativeUser = await prisma.user.create({
        data: {
          email: `${islandA.unique}-relative@example.test`,
          passwordHash: 'x',
          role: 'CUSTOMER',
        },
      });
      const relative = await prisma.customer.create({
        data: {
          userId: relativeUser.id,
          name: `Relative ${islandA.unique}`,
          phone: '010-1111-2222',
        },
      });
      await prisma.familyLink.create({
        data: {
          inviterCustomerId: islandA.customerId,
          inviteeCustomerId: relative.id,
          status: FamilyLinkStatus.ACCEPTED,
          code: `brief-fam-${islandA.unique}`,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      const bookingId = await freshBooking(BookingStatus.CONFIRMED,
        '수면이 고민입니다',);

      const brief = await consultationService.getBookingBrief(
        islandA.counselorId,
        bookingId,
      );

      // Field correctness.
      expect(brief.bookingId).toBe(bookingId);
      expect(brief.concern).toBe('수면이 고민입니다');
      expect(brief.subjectId).toBe(islandA.customerId);
      // ADR 0014: opening the brief ensures a pre-consultation guidance row.
      // In the test env (Ollama unreachable) it is FALLBACK with non-empty
      // deterministic content and no model.
      expect(brief.guidance).not.toBeNull();
      expect(brief.guidance!.status).toBe(BriefGuidanceStatus.FALLBACK);
      expect(brief.guidance!.model).toBeNull();
      expect(brief.guidance!.content.length).toBeGreaterThan(0);
      // Self-consultation (subject == applicant): family context is suppressed
      // even though the applicant HAS an ACCEPTED family link — it is only
      // meaningful when consulting on a linked family member's data.
      expect(brief.family).toEqual([]);
      expect(brief.family.map((f) => f.customerId)).not.toContain(relative.id);

      // Indicators sorted metricKey asc — deterministic ordering.
      const keys = brief.indicators.map((i) => i.metricKey);
      const sorted = [...keys].sort((a, b) => a.localeCompare(b));
      expect(keys).toEqual(sorted);
      expect(keys).toContain('focus_index');
      expect(keys).toContain('alpha_wave');

      // Determinism: a second assembly on the same data is byte-identical.
      const brief2 = await consultationService.getBookingBrief(
        islandA.counselorId,
        bookingId,
      );
      expect(JSON.stringify(brief2.indicators)).toBe(
        JSON.stringify(brief.indicators),
      );
      expect(JSON.stringify(brief2.family)).toBe(JSON.stringify(brief.family));
    });

    it('family-data consultation: shows family context AND the subject (linked relative) test indicators', async () => {
      // The applicant (islandA.customer) books using a LINKED relative's test
      // result, so the consultation subject is the relative — not the applicant.
      const relativeUser = await prisma.user.create({
        data: {
          email: `${islandA.unique}-famsubj@example.test`,
          passwordHash: 'x',
          role: 'CUSTOMER',
        },
      });
      const relative = await prisma.customer.create({
        data: {
          userId: relativeUser.id,
          name: `FamSubject ${islandA.unique}`,
          phone: '010-3333-4444',
        },
      });
      await prisma.familyLink.create({
        data: {
          inviterCustomerId: islandA.customerId,
          inviteeCustomerId: relative.id,
          status: FamilyLinkStatus.ACCEPTED,
          code: `brief-famsubj-${islandA.unique}`,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      // The relative's OWN test result — its metrics must surface as the brief
      // indicators (proving indicators follow the subject, not the applicant).
      await prisma.testResult.create({
        data: {
          subjectType: SubjectType.CUSTOMER,
          subjectId: relative.id,
          serviceType: 'hormone',
          metrics: { relative_marker: 7 },
        },
      });

      const bookingId = await freshBooking(
        BookingStatus.CONFIRMED,
        undefined,
        relative.id,
      );
      const brief = await consultationService.getBookingBrief(
        islandA.counselorId,
        bookingId,
      );

      // Subject is the relative (family member), not the applicant.
      expect(brief.subjectId).toBe(relative.id);
      // Family context appears for a family-data consultation and links back to
      // the consenting applicant.
      expect(brief.family.map((f) => f.customerId)).toContain(
        islandA.customerId,
      );
      // Indicators are the SUBJECT (relative)'s test results, not the applicant's.
      expect(brief.indicators.map((i) => i.metricKey)).toContain(
        'relative_marker',
      );
    });

    it('orders pastRecords createdAt desc (newest first)', async () => {
      // Two completed bookings with records for the same subject.
      const olderBooking = await freshBooking(BookingStatus.CONFIRMED,
      );
      await consultationService.createRecord(islandA.counselorId, {
        bookingId: olderBooking,
        summary: 'older record',
        recommendation: '권고 A',
        actions: [],
        outcome: 'EXPLAINED' as never,
        interestedProductIds: [],
        metricRefs: [],
      });

      const newerBooking = await freshBooking(BookingStatus.CONFIRMED,
      );
      await consultationService.createRecord(islandA.counselorId, {
        bookingId: newerBooking,
        summary: 'newer record',
        recommendation: '권고 B',
        actions: [],
        outcome: 'GUIDED' as never,
        interestedProductIds: [],
        metricRefs: [],
      });

      // Open a brief for any booking of the same subject.
      const briefBooking = await freshBooking(BookingStatus.CONFIRMED,
      );
      const brief = await consultationService.getBookingBrief(
        islandA.counselorId,
        briefBooking,
      );

      const summaries = brief.pastRecords.map((r) => r.summary);
      const newerIdx = summaries.indexOf('newer record');
      const olderIdx = summaries.indexOf('older record');
      expect(newerIdx).toBeGreaterThanOrEqual(0);
      expect(olderIdx).toBeGreaterThanOrEqual(0);
      // createdAt desc → newer record appears before older record.
      expect(newerIdx).toBeLessThan(olderIdx);

      // Timestamps are monotonically non-increasing.
      const times = brief.pastRecords.map((r) => new Date(r.createdAt).getTime());
      for (let i = 1; i < times.length; i += 1) {
        expect(times[i - 1]).toBeGreaterThanOrEqual(times[i]);
      }
    });
  });

  // ── AC-P2: ownership boundary ──────────────────────────────────────────────

  describe('AC-P2: ownership boundary', () => {
    it('foreign counselor opening the brief over HTTP gets 403', async () => {
      const bookingId = await freshBooking(BookingStatus.CONFIRMED,
      );

      const res = await request(app.getHttpServer())
        .get(`/counselor/bookings/${bookingId}/brief`)
        .set('Authorization', `Bearer ${islandB.counselorToken}`);

      expect(res.status).toBe(403);
    });

    it('the assigned counselor opening the brief over HTTP gets 200', async () => {
      const bookingId = await freshBooking(BookingStatus.CONFIRMED,
      );

      const res = await request(app.getHttpServer())
        .get(`/counselor/bookings/${bookingId}/brief`)
        .set('Authorization', `Bearer ${islandA.counselorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.bookingId).toBe(bookingId);
    });

    it('unauthenticated brief request gets 401', async () => {
      const bookingId = await freshBooking(BookingStatus.CONFIRMED,
      );

      const res = await request(app.getHttpServer()).get(
        `/counselor/bookings/${bookingId}/brief`,
      );

      expect(res.status).toBe(401);
    });
  });

  // ── AC-P7 marker (M3): briefOpenedAt idempotency ───────────────────────────

  describe('AC-P7 marker: briefOpenedAt idempotency (M3)', () => {
    it('first open sets briefOpenedAt; a second sequential open leaves it unchanged', async () => {
      const bookingId = await freshBooking(BookingStatus.CONFIRMED,
      );

      const before = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { briefOpenedAt: true },
      });
      expect(before?.briefOpenedAt).toBeNull();

      // First open marks it.
      await consultationService.getBookingBrief(islandA.counselorId, bookingId);
      const firstOpen = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { briefOpenedAt: true },
      });
      expect(firstOpen?.briefOpenedAt).not.toBeNull();
      const firstTs = firstOpen!.briefOpenedAt!.getTime();

      // Second open must NOT move the timestamp (conditional updateMany guards
      // on briefOpenedAt: null → the second write affects zero rows).
      await consultationService.getBookingBrief(islandA.counselorId, bookingId);
      const secondOpen = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { briefOpenedAt: true },
      });
      expect(secondOpen!.briefOpenedAt!.getTime()).toBe(firstTs);
    });

    it('the conditional update affects zero rows once briefOpenedAt is set', async () => {
      const bookingId = await freshBooking(BookingStatus.CONFIRMED,
      );

      // Open once so briefOpenedAt is set.
      await consultationService.getBookingBrief(islandA.counselorId, bookingId);

      // The second marker write is a no-op: the same guarded updateMany the
      // service issues must report count 0 now that the column is non-null.
      const result = await prisma.booking.updateMany({
        where: { id: bookingId, briefOpenedAt: null },
        data: { briefOpenedAt: new Date() },
      });
      expect(result.count).toBe(0);
    });
  });
});
