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
 * Contact-logging analytics (AC-6, ADR 0016) — contactAttempts,
 * callOutcomeDistribution, and noShowWithoutContactRate in GET /admin/analytics.
 *
 * [P2] Every contact metric is scoped through booking.slot.counselorId (the SLOT
 * owner), NOT the denormalised CallLog.counselorId — identical key to
 * groupBookingFunnel. The test proves this two ways:
 *   1. scope=own surfaces only the requesting counselor's island (isolation).
 *   2. the NO_SHOW denominator of noShowWithoutContactRate equals funnel.noShow
 *      (same slot.counselorId-scoped NO_SHOW set → funnel parity).
 *
 * Three disjoint islands cover the 0-vs-null sentinel:
 *   Island A (counselorA): 1 COMPLETED+CONNECTED, 1 NO_SHOW+2×NO_ANSWER,
 *       1 NO_SHOW with no CallLog
 *       ⇒ contactAttempts=3, dist={CONNECTED:1,NO_ANSWER:2,INVALID:0}
 *         funnel.noShow=2, noShowWithoutContactRate=0.5 (1 uncontacted / 2)
 *   Island B (counselorB): 1 NO_SHOW+1×INVALID
 *       ⇒ contactAttempts=1, dist={CONNECTED:0,NO_ANSWER:0,INVALID:1}
 *         funnel.noShow=1, noShowWithoutContactRate=0 (the NO_SHOW was contacted)
 *   Island C (counselorC): 1 COMPLETED+1×CONNECTED, zero NO_SHOW
 *       ⇒ contactAttempts=1, dist={CONNECTED:1,NO_ANSWER:0,INVALID:0}
 *         funnel.noShow=0, noShowWithoutContactRate=null (no data)
 */
describe('Contact-logging analytics (AC-6 — scoped attempts + 0-vs-null)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let islandA: SeededData; // rate 0.5
  let islandB: SeededData; // rate 0
  let islandC: SeededData; // rate null

  // Past slot window (2h ago → 1h ago), shared by all islands.
  const pastEnd = new Date(Date.now() - 60 * 60 * 1000);
  const pastStart = new Date(pastEnd.getTime() - 60 * 60 * 1000);

  async function createPastBooking(
    island: SeededData,
    status: BookingStatus,
  ): Promise<string> {
    const slot = await prisma.availabilitySlot.create({
      data: {
        counselorId: island.counselorId,
        startAt: pastStart,
        endAt: pastEnd,
        isOpen: true,
      },
    });
    // Terminal bookings (COMPLETED/NO_SHOW) bypass the partial unique index,
    // which covers only PENDING + CONFIRMED.
    const booking = await prisma.booking.create({
      data: {
        slotId: slot.id,
        customerId: island.customerId,
        subjectType: SubjectType.CUSTOMER,
        subjectId: island.customerId,
        status,
        slotStartAt: pastStart,
        slotEndAt: pastEnd,
      },
    });
    return booking.id;
  }

  async function logCall(
    island: SeededData,
    bookingId: string,
    outcome: CallOutcome,
  ): Promise<void> {
    await prisma.callLog.create({
      data: { bookingId, counselorId: island.counselorId, outcome },
    });
  }

  beforeAll(async () => {
    const ctx = await bootTestApp();
    app = ctx.app;
    prisma = ctx.prisma;

    islandA = await seedIsolated(prisma, ctx.signToken, { slotCount: 1 });
    islandB = await seedIsolated(prisma, ctx.signToken, { slotCount: 1 });
    islandC = await seedIsolated(prisma, ctx.signToken, { slotCount: 1 });

    // ── Island A ────────────────────────────────────────────────────────────
    const a1 = await createPastBooking(islandA, BookingStatus.COMPLETED);
    await logCall(islandA, a1, CallOutcome.CONNECTED);

    const a2 = await createPastBooking(islandA, BookingStatus.NO_SHOW);
    await logCall(islandA, a2, CallOutcome.NO_ANSWER);
    await logCall(islandA, a2, CallOutcome.NO_ANSWER);

    // a3: NO_SHOW with NO CallLog (the uncontacted no-show).
    await createPastBooking(islandA, BookingStatus.NO_SHOW);

    // ── Island B ────────────────────────────────────────────────────────────
    const b1 = await createPastBooking(islandB, BookingStatus.NO_SHOW);
    await logCall(islandB, b1, CallOutcome.INVALID);

    // ── Island C ────────────────────────────────────────────────────────────
    const c1 = await createPastBooking(islandC, BookingStatus.COMPLETED);
    await logCall(islandC, c1, CallOutcome.CONNECTED);
  });

  afterAll(async () => {
    // cleanupSeeded deletes the customer (cascades bookings → CallLogs) and the
    // counselor (cascades slots + CallLogs). No extra cleanup needed.
    await cleanupSeeded(prisma, islandA);
    await cleanupSeeded(prisma, islandB);
    await cleanupSeeded(prisma, islandC);
    await app.close();
  });

  // ── Island A — rate 0.5, full distribution ─────────────────────────────────

  describe('Island A (scope=own) — contactAttempts + distribution + rate 0.5', () => {
    it('exposes all three contact fields with correct values', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/analytics')
        .set('Authorization', `Bearer ${islandA.counselorToken}`);

      expect(res.status).toBe(200);

      // Fields present (AC-6 shape).
      expect(typeof res.body.contactAttempts).toBe('number');
      expect(res.body.callOutcomeDistribution).toBeDefined();
      expect(
        Object.prototype.hasOwnProperty.call(
          res.body,
          'noShowWithoutContactRate',
        ),
      ).toBe(true);

      // 1 CONNECTED + 2 NO_ANSWER = 3 attempts.
      expect(res.body.contactAttempts).toBe(3);
      expect(res.body.callOutcomeDistribution).toEqual({
        CONNECTED: 1,
        NO_ANSWER: 2,
        INVALID: 0,
      });

      // 2 NO_SHOW bookings, 1 with no CallLog → 1/2 = 0.5.
      expect(res.body.noShowWithoutContactRate).toBeCloseTo(0.5);
    });

    it('noShow denominator matches funnel.noShow (slot.counselorId parity)', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/analytics')
        .set('Authorization', `Bearer ${islandA.counselorToken}`);

      expect(res.status).toBe(200);
      // funnel.noShow and the rate denominator read the SAME slot.counselorId
      // scoped NO_SHOW set: 2 NO_SHOW, rate 0.5 ⇒ 1 uncontacted.
      expect(res.body.funnel.noShow).toBe(2);
      expect(res.body.noShowWithoutContactRate).toBeCloseTo(0.5);
    });
  });

  // ── Island B — rate 0 (contacted no-show) ──────────────────────────────────

  describe('Island B (scope=own) — INVALID outcome, rate 0', () => {
    it('contactAttempts=1, INVALID distribution, rate 0 (not null)', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/analytics')
        .set('Authorization', `Bearer ${islandB.counselorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.contactAttempts).toBe(1);
      expect(res.body.callOutcomeDistribution).toEqual({
        CONNECTED: 0,
        NO_ANSWER: 0,
        INVALID: 1,
      });
      // 1 NO_SHOW, contacted → 0/1 = 0 (distinct from C's null).
      expect(res.body.funnel.noShow).toBe(1);
      expect(res.body.noShowWithoutContactRate).toBe(0);
    });
  });

  // ── Island C — rate null (no NO_SHOW) ──────────────────────────────────────

  describe('Island C (scope=own) — no NO_SHOW, rate null', () => {
    it('contactAttempts=1, rate null (no NO_SHOW bookings)', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/analytics')
        .set('Authorization', `Bearer ${islandC.counselorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.contactAttempts).toBe(1);
      expect(res.body.callOutcomeDistribution).toEqual({
        CONNECTED: 1,
        NO_ANSWER: 0,
        INVALID: 0,
      });
      // Zero NO_SHOW → "no data" sentinel null, distinct from B's 0.
      expect(res.body.funnel.noShow).toBe(0);
      expect(res.body.noShowWithoutContactRate).toBeNull();
    });
  });

  // ── Cross-island scope isolation ────────────────────────────────────────────

  describe('scope isolation — other islands must not bleed into A', () => {
    it('counselorA contactAttempts is 3, not inflated by B/C CallLogs', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/analytics')
        .set('Authorization', `Bearer ${islandA.counselorToken}`);

      expect(res.status).toBe(200);
      // B (1 INVALID) and C (1 CONNECTED) must not leak into A's scoped count.
      expect(res.body.contactAttempts).toBe(3);
      expect(res.body.callOutcomeDistribution.INVALID).toBe(0);
    });
  });

  // ── own/all toggle parity with funnel scope ─────────────────────────────────

  describe('scope=all toggle — global aggregate includes every island', () => {
    it('counselorA with ?scope=all sees all islands aggregated', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/analytics?scope=all')
        .set('Authorization', `Bearer ${islandA.counselorToken}`);

      expect(res.status).toBe(200);

      // A(3) + B(1) + C(1) = 5 attempts minimum (plus any other global data).
      expect(res.body.contactAttempts).toBeGreaterThanOrEqual(5);
      // Every outcome seen across islands must appear in the global distribution.
      expect(res.body.callOutcomeDistribution.CONNECTED).toBeGreaterThanOrEqual(
        2,
      );
      expect(res.body.callOutcomeDistribution.NO_ANSWER).toBeGreaterThanOrEqual(
        2,
      );
      expect(res.body.callOutcomeDistribution.INVALID).toBeGreaterThanOrEqual(1);
      // scope=all NO_SHOW (≥3: A’s 2 + B’s 1) parity-tracks funnel.noShow.
      expect(res.body.funnel.noShow).toBeGreaterThanOrEqual(3);
      // Global rate is a number in [0,1] (NO_SHOW bookings exist globally).
      expect(typeof res.body.noShowWithoutContactRate).toBe('number');
      expect(res.body.noShowWithoutContactRate).toBeGreaterThanOrEqual(0);
      expect(res.body.noShowWithoutContactRate).toBeLessThanOrEqual(1);
    });

    it('own scope is strictly narrower than all scope (toggle actually scopes)', async () => {
      const own = await request(app.getHttpServer())
        .get('/admin/analytics')
        .set('Authorization', `Bearer ${islandA.counselorToken}`);
      const all = await request(app.getHttpServer())
        .get('/admin/analytics?scope=all')
        .set('Authorization', `Bearer ${islandA.counselorToken}`);

      expect(own.status).toBe(200);
      expect(all.status).toBe(200);
      // The same slot.counselorId toggle that scopes the funnel scopes contacts:
      // own (3) must not exceed all, and all must include B+C beyond A.
      expect(all.body.contactAttempts).toBeGreaterThan(own.body.contactAttempts);
    });
  });
});
