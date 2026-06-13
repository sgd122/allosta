import { INestApplication } from '@nestjs/common';
import { BookingStatus, CallOutcome, SubjectType } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  bootTestApp,
  cleanupSeeded,
  seedIsolated,
  SeededData,
} from './helpers/test-app';

/**
 * CallLog creation endpoint (contact surfacing, ADR 0016).
 *
 * - AC-4: POST /counselor/bookings/:bookingId/calls creates a CallLog row
 *   (bookingId, counselorId, outcome, note?, createdAt) and validates the body.
 * - AC-5: a counselor may only log calls on their OWN booking — a foreign
 *   counselor is denied (403) and no row is written.
 * - AC-7 (regression): logging a call NEVER mutates Booking.status — attendance
 *   stays single-source-of-truth (P5 loose coupling).
 */
describe('CallLog creation (AC-4/AC-5/AC-7)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let islandA: SeededData;
  let islandB: SeededData; // foreign counselor for ownership

  beforeAll(async () => {
    const ctx = await bootTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    islandA = await seedIsolated(prisma, ctx.signToken, { slotCount: 1 });
    islandB = await seedIsolated(prisma, ctx.signToken, { slotCount: 1 });
  });

  afterAll(async () => {
    await cleanupSeeded(prisma, islandA);
    await cleanupSeeded(prisma, islandB);
    await app.close();
  });

  // A dedicated future slot + booking on islandA per call, so the partial unique
  // index (booking_slot_active_unique) never bars parallel active bookings.
  let slotSeq = 0;
  async function freshBooking(status: BookingStatus): Promise<string> {
    slotSeq += 1;
    const startAt = new Date(Date.now() + (200 + slotSeq) * 24 * 60 * 60 * 1000);
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
        subjectId: islandA.customerId,
        status,
        slotStartAt: slot.startAt,
        slotEndAt: slot.endAt,
      },
    });
    return booking.id;
  }

  // ── AC-4: CallLog creation + DTO validation ────────────────────────────────

  describe('AC-4: CallLog creation', () => {
    it('the assigned counselor logs a call and a CallLog row is persisted', async () => {
      const bookingId = await freshBooking(BookingStatus.CONFIRMED);

      const res = await request(app.getHttpServer())
        .post(`/counselor/bookings/${bookingId}/calls`)
        .set('Authorization', `Bearer ${islandA.counselorToken}`)
        .send({ outcome: CallOutcome.NO_ANSWER, note: '부재중, 저녁 재시도' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.bookingId).toBe(bookingId);
      expect(res.body.counselorId).toBe(islandA.counselorId);
      expect(res.body.outcome).toBe(CallOutcome.NO_ANSWER);
      // M-1 containment: the note is persisted but must NEVER be echoed back in
      // the response (PII-adjacent — write-only evidence).
      expect(res.body.note).toBeUndefined();

      const row = await prisma.callLog.findUnique({
        where: { id: res.body.id },
      });
      expect(row).not.toBeNull();
      expect(row!.bookingId).toBe(bookingId);
      expect(row!.counselorId).toBe(islandA.counselorId);
      expect(row!.outcome).toBe(CallOutcome.NO_ANSWER);
      // The note IS still persisted in the DB (just not returned).
      expect(row!.note).toBe('부재중, 저녁 재시도');
      expect(row!.createdAt).toBeInstanceOf(Date);
    });

    it('note is optional — a CallLog can be created with outcome only', async () => {
      const bookingId = await freshBooking(BookingStatus.CONFIRMED);

      const res = await request(app.getHttpServer())
        .post(`/counselor/bookings/${bookingId}/calls`)
        .set('Authorization', `Bearer ${islandA.counselorToken}`)
        .send({ outcome: CallOutcome.CONNECTED });

      expect(res.status).toBe(201);
      const row = await prisma.callLog.findUnique({
        where: { id: res.body.id },
      });
      expect(row!.note).toBeNull();
    });

    it('rejects an invalid outcome (400)', async () => {
      const bookingId = await freshBooking(BookingStatus.CONFIRMED);

      const res = await request(app.getHttpServer())
        .post(`/counselor/bookings/${bookingId}/calls`)
        .set('Authorization', `Bearer ${islandA.counselorToken}`)
        .send({ outcome: 'WRONG' });

      expect(res.status).toBe(400);
    });

    it('rejects a note over the length bound (400)', async () => {
      const bookingId = await freshBooking(BookingStatus.CONFIRMED);

      const res = await request(app.getHttpServer())
        .post(`/counselor/bookings/${bookingId}/calls`)
        .set('Authorization', `Bearer ${islandA.counselorToken}`)
        .send({ outcome: CallOutcome.CONNECTED, note: 'x'.repeat(1001) });

      expect(res.status).toBe(400);
    });

    it('unauthenticated call logging is denied (401)', async () => {
      const bookingId = await freshBooking(BookingStatus.CONFIRMED);

      const res = await request(app.getHttpServer())
        .post(`/counselor/bookings/${bookingId}/calls`)
        .send({ outcome: CallOutcome.CONNECTED });

      expect(res.status).toBe(401);
    });
  });

  // ── AC-5: ownership boundary ───────────────────────────────────────────────

  describe('AC-5: ownership boundary', () => {
    it('a foreign counselor logging a call is denied (403) and writes no row', async () => {
      const bookingId = await freshBooking(BookingStatus.CONFIRMED);

      const res = await request(app.getHttpServer())
        .post(`/counselor/bookings/${bookingId}/calls`)
        .set('Authorization', `Bearer ${islandB.counselorToken}`)
        .send({ outcome: CallOutcome.CONNECTED });

      expect(res.status).toBe(403);

      const count = await prisma.callLog.count({ where: { bookingId } });
      expect(count).toBe(0);
    });
  });

  // ── Call editing: correct a mis-clicked outcome / refine the memo (ADR 0016) ─

  describe('Call editing (PATCH .../calls/:callId)', () => {
    async function logCall(
      bookingId: string,
      token: string,
      outcome: CallOutcome,
      note?: string,
    ): Promise<string> {
      const res = await request(app.getHttpServer())
        .post(`/counselor/bookings/${bookingId}/calls`)
        .set('Authorization', `Bearer ${token}`)
        .send({ outcome, ...(note !== undefined ? { note } : {}) })
        .expect(201);
      return res.body.id as string;
    }

    it('the assigned counselor edits outcome + note and the change is persisted', async () => {
      const bookingId = await freshBooking(BookingStatus.CONFIRMED);
      const callId = await logCall(
        bookingId,
        islandA.counselorToken,
        CallOutcome.NO_ANSWER,
        '부재중',
      );

      const res = await request(app.getHttpServer())
        .patch(`/counselor/bookings/${bookingId}/calls/${callId}`)
        .set('Authorization', `Bearer ${islandA.counselorToken}`)
        .send({ outcome: CallOutcome.CONNECTED, note: '다시 연결됨' });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(callId);
      expect(res.body.bookingId).toBe(bookingId);
      expect(res.body.outcome).toBe(CallOutcome.CONNECTED);
      // Containment: the note is never echoed back (write-only, PII-adjacent).
      expect(res.body.note).toBeUndefined();

      const row = await prisma.callLog.findUnique({ where: { id: callId } });
      expect(row!.outcome).toBe(CallOutcome.CONNECTED);
      // The note IS persisted (just not returned).
      expect(row!.note).toBe('다시 연결됨');
    });

    it('clearing the note (omitting it) persists null', async () => {
      const bookingId = await freshBooking(BookingStatus.CONFIRMED);
      const callId = await logCall(
        bookingId,
        islandA.counselorToken,
        CallOutcome.NO_ANSWER,
        '메모 있음',
      );

      await request(app.getHttpServer())
        .patch(`/counselor/bookings/${bookingId}/calls/${callId}`)
        .set('Authorization', `Bearer ${islandA.counselorToken}`)
        .send({ outcome: CallOutcome.INVALID })
        .expect(200);

      const row = await prisma.callLog.findUnique({ where: { id: callId } });
      expect(row!.outcome).toBe(CallOutcome.INVALID);
      expect(row!.note).toBeNull();
    });

    it('rejects an invalid outcome on edit (400)', async () => {
      const bookingId = await freshBooking(BookingStatus.CONFIRMED);
      const callId = await logCall(
        bookingId,
        islandA.counselorToken,
        CallOutcome.CONNECTED,
      );

      const res = await request(app.getHttpServer())
        .patch(`/counselor/bookings/${bookingId}/calls/${callId}`)
        .set('Authorization', `Bearer ${islandA.counselorToken}`)
        .send({ outcome: 'WRONG' });

      expect(res.status).toBe(400);
    });

    it('a foreign counselor editing a call is denied (403) and the row is unchanged', async () => {
      const bookingId = await freshBooking(BookingStatus.CONFIRMED);
      const callId = await logCall(
        bookingId,
        islandA.counselorToken,
        CallOutcome.NO_ANSWER,
      );

      const res = await request(app.getHttpServer())
        .patch(`/counselor/bookings/${bookingId}/calls/${callId}`)
        .set('Authorization', `Bearer ${islandB.counselorToken}`)
        .send({ outcome: CallOutcome.CONNECTED });

      expect(res.status).toBe(403);

      const row = await prisma.callLog.findUnique({ where: { id: callId } });
      expect(row!.outcome).toBe(CallOutcome.NO_ANSWER);
    });

    it('editing a callId that belongs to a DIFFERENT booking is rejected (404)', async () => {
      const bookingOne = await freshBooking(BookingStatus.CONFIRMED);
      const bookingTwo = await freshBooking(BookingStatus.CONFIRMED);
      // A call logged against bookingOne ...
      const callId = await logCall(
        bookingOne,
        islandA.counselorToken,
        CallOutcome.NO_ANSWER,
      );

      // ... cannot be edited via bookingTwo's path, even by the OWNING counselor.
      const res = await request(app.getHttpServer())
        .patch(`/counselor/bookings/${bookingTwo}/calls/${callId}`)
        .set('Authorization', `Bearer ${islandA.counselorToken}`)
        .send({ outcome: CallOutcome.CONNECTED });

      expect(res.status).toBe(404);

      // The original row is untouched.
      const row = await prisma.callLog.findUnique({ where: { id: callId } });
      expect(row!.outcome).toBe(CallOutcome.NO_ANSWER);
    });

    it('editing a non-existent callId is rejected (404)', async () => {
      const bookingId = await freshBooking(BookingStatus.CONFIRMED);

      const res = await request(app.getHttpServer())
        .patch(`/counselor/bookings/${bookingId}/calls/non-existent-id`)
        .set('Authorization', `Bearer ${islandA.counselorToken}`)
        .send({ outcome: CallOutcome.CONNECTED });

      expect(res.status).toBe(404);
    });

    it('editing a call NEVER mutates booking.status (P5 regression)', async () => {
      const bookingId = await freshBooking(BookingStatus.CONFIRMED);
      const callId = await logCall(
        bookingId,
        islandA.counselorToken,
        CallOutcome.NO_ANSWER,
      );

      await request(app.getHttpServer())
        .patch(`/counselor/bookings/${bookingId}/calls/${callId}`)
        .set('Authorization', `Bearer ${islandA.counselorToken}`)
        .send({ outcome: CallOutcome.CONNECTED })
        .expect(200);

      const after = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { status: true },
      });
      // Attendance stays single-source-of-truth on Booking — editing evidence
      // never touches it (P5 loose coupling).
      expect(after!.status).toBe(BookingStatus.CONFIRMED);
    });
  });

  // ── Call deletion: remove an erroneously created entry (ADR 0016) ───────────

  describe('Call deletion (DELETE .../calls/:callId)', () => {
    async function logCall(
      bookingId: string,
      token: string,
      outcome: CallOutcome,
    ): Promise<string> {
      const res = await request(app.getHttpServer())
        .post(`/counselor/bookings/${bookingId}/calls`)
        .set('Authorization', `Bearer ${token}`)
        .send({ outcome })
        .expect(201);
      return res.body.id as string;
    }

    it('the assigned counselor deletes a call and the row is gone', async () => {
      const bookingId = await freshBooking(BookingStatus.CONFIRMED);
      const callId = await logCall(bookingId, islandA.counselorToken, CallOutcome.NO_ANSWER);

      const res = await request(app.getHttpServer())
        .delete(`/counselor/bookings/${bookingId}/calls/${callId}`)
        .set('Authorization', `Bearer ${islandA.counselorToken}`);

      expect(res.status).toBe(200);

      const row = await prisma.callLog.findUnique({ where: { id: callId } });
      expect(row).toBeNull();
    });

    it('a foreign counselor deleting a call is denied (403) and the row is still present', async () => {
      const bookingId = await freshBooking(BookingStatus.CONFIRMED);
      const callId = await logCall(bookingId, islandA.counselorToken, CallOutcome.CONNECTED);

      const res = await request(app.getHttpServer())
        .delete(`/counselor/bookings/${bookingId}/calls/${callId}`)
        .set('Authorization', `Bearer ${islandB.counselorToken}`);

      expect(res.status).toBe(403);

      const row = await prisma.callLog.findUnique({ where: { id: callId } });
      expect(row).not.toBeNull();
    });

    it('deleting a callId that belongs to a DIFFERENT booking is rejected (404)', async () => {
      const bookingOne = await freshBooking(BookingStatus.CONFIRMED);
      const bookingTwo = await freshBooking(BookingStatus.CONFIRMED);
      const callId = await logCall(bookingOne, islandA.counselorToken, CallOutcome.NO_ANSWER);

      const res = await request(app.getHttpServer())
        .delete(`/counselor/bookings/${bookingTwo}/calls/${callId}`)
        .set('Authorization', `Bearer ${islandA.counselorToken}`);

      expect(res.status).toBe(404);

      const row = await prisma.callLog.findUnique({ where: { id: callId } });
      expect(row).not.toBeNull();
    });

    it('deleting a non-existent callId is rejected (404)', async () => {
      const bookingId = await freshBooking(BookingStatus.CONFIRMED);

      const res = await request(app.getHttpServer())
        .delete(`/counselor/bookings/${bookingId}/calls/non-existent-id`)
        .set('Authorization', `Bearer ${islandA.counselorToken}`);

      expect(res.status).toBe(404);
    });

    it('deleting a call NEVER mutates booking.status (P5 regression)', async () => {
      const bookingId = await freshBooking(BookingStatus.CONFIRMED);
      const callId = await logCall(bookingId, islandA.counselorToken, CallOutcome.NO_ANSWER);

      await request(app.getHttpServer())
        .delete(`/counselor/bookings/${bookingId}/calls/${callId}`)
        .set('Authorization', `Bearer ${islandA.counselorToken}`)
        .expect(200);

      const after = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { status: true },
      });
      expect(after!.status).toBe(BookingStatus.CONFIRMED);
    });
  });

  // ── AC-7: attendance invariant (P5 loose coupling regression) ──────────────

  describe('AC-7: CallLog creation never mutates booking.status', () => {
    it('booking.status is unchanged after a call is logged', async () => {
      const bookingId = await freshBooking(BookingStatus.CONFIRMED);

      const before = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { status: true },
      });
      expect(before!.status).toBe(BookingStatus.CONFIRMED);

      await request(app.getHttpServer())
        .post(`/counselor/bookings/${bookingId}/calls`)
        .set('Authorization', `Bearer ${islandA.counselorToken}`)
        .send({ outcome: CallOutcome.NO_ANSWER })
        .expect(201);

      const after = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { status: true },
      });
      // Attendance is single-source-of-truth on Booking and is NEVER touched by
      // CallLog creation (P5) — the status must be byte-identical.
      expect(after!.status).toBe(BookingStatus.CONFIRMED);
    });

    it('multiple NO_ANSWER logs still leave booking.status untouched', async () => {
      const bookingId = await freshBooking(BookingStatus.PENDING);

      for (let i = 0; i < 3; i += 1) {
        await request(app.getHttpServer())
          .post(`/counselor/bookings/${bookingId}/calls`)
          .set('Authorization', `Bearer ${islandA.counselorToken}`)
          .send({ outcome: CallOutcome.NO_ANSWER })
          .expect(201);
      }

      const after = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { status: true },
      });
      expect(after!.status).toBe(BookingStatus.PENDING);
      const count = await prisma.callLog.count({ where: { bookingId } });
      expect(count).toBe(3);
    });
  });
});
