import { INestApplication } from '@nestjs/common';
import { BookingStatus, SubjectType } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  bootTestApp,
  cleanupSeeded,
  seedIsolated,
  SeededData,
} from './helpers/test-app';

/**
 * Ops funnel analytics — funnel counts + noShowRate + slotUtilization in
 * GET /admin/analytics (plan AC-A1..A3).
 *
 * Two isolated data islands ensure scope=own (counselor JWT) only surfaces
 * that counselor's own bookings/slots and never the other island's data.
 *
 * Island A (counselorA):
 *   - 3 past isOpen slots
 *       slotA1 → COMPLETED booking
 *       slotA2 → NO_SHOW booking
 *       slotA3 → no booking (open, past, unused)
 *   Expected:
 *       funnel.completed = 1, funnel.noShow = 1, rest = 0
 *       noShowRate        = 0.5  (1 / (1+1))
 *       slotUtilization   = 2/3  (2 slots with a booking / 3 past isOpen slots)
 *
 * Island B (counselorB):
 *   - 2 past isOpen slots, both with COMPLETED bookings
 *   Expected:
 *       funnel.completed = 2, funnel.noShow = 0
 *       noShowRate        = 0
 *       slotUtilization   = 1.0  (2/2)
 */
describe('Analytics ops funnel + rates (scope=own, AC-A1..A4)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let islandA: SeededData;
  let islandB: SeededData;

  beforeAll(async () => {
    const ctx = await bootTestApp();
    app = ctx.app;
    prisma = ctx.prisma;

    islandA = await seedIsolated(prisma, ctx.signToken, { slotCount: 1 });
    islandB = await seedIsolated(prisma, ctx.signToken, { slotCount: 1 });

    // Past slot time window used for both islands (2 hours ago → 1 hour ago).
    const pastEnd = new Date(Date.now() - 60 * 60 * 1000);
    const pastStart = new Date(pastEnd.getTime() - 60 * 60 * 1000);

    // ── Island A: 3 past isOpen slots ─────────────────────────────────────
    const slotA1 = await prisma.availabilitySlot.create({
      data: {
        counselorId: islandA.counselorId,
        startAt: pastStart,
        endAt: pastEnd,
        isOpen: true,
      },
    });
    const slotA2 = await prisma.availabilitySlot.create({
      data: {
        counselorId: islandA.counselorId,
        startAt: pastStart,
        endAt: pastEnd,
        isOpen: true,
      },
    });
    // slotA3: past isOpen, no booking — only created, never booked.
    await prisma.availabilitySlot.create({
      data: {
        counselorId: islandA.counselorId,
        startAt: pastStart,
        endAt: pastEnd,
        isOpen: true,
      },
    });

    // Terminal bookings bypass the partial unique index (index covers only
    // PENDING + CONFIRMED; COMPLETED and NO_SHOW are not indexed).
    await prisma.booking.create({
      data: {
        slotId: slotA1.id,
        customerId: islandA.customerId,
        subjectType: SubjectType.CUSTOMER,
        subjectId: islandA.customerId,
        status: BookingStatus.COMPLETED,
        slotStartAt: pastStart,
        slotEndAt: pastEnd,
      },
    });
    await prisma.booking.create({
      data: {
        slotId: slotA2.id,
        customerId: islandA.customerId,
        subjectType: SubjectType.CUSTOMER,
        subjectId: islandA.customerId,
        status: BookingStatus.NO_SHOW,
        slotStartAt: pastStart,
        slotEndAt: pastEnd,
      },
    });

    // ── Island B: 2 past isOpen slots, both utilised ──────────────────────
    const slotB1 = await prisma.availabilitySlot.create({
      data: {
        counselorId: islandB.counselorId,
        startAt: pastStart,
        endAt: pastEnd,
        isOpen: true,
      },
    });
    const slotB2 = await prisma.availabilitySlot.create({
      data: {
        counselorId: islandB.counselorId,
        startAt: pastStart,
        endAt: pastEnd,
        isOpen: true,
      },
    });

    await prisma.booking.create({
      data: {
        slotId: slotB1.id,
        customerId: islandB.customerId,
        subjectType: SubjectType.CUSTOMER,
        subjectId: islandB.customerId,
        status: BookingStatus.COMPLETED,
        slotStartAt: pastStart,
        slotEndAt: pastEnd,
      },
    });
    await prisma.booking.create({
      data: {
        slotId: slotB2.id,
        customerId: islandB.customerId,
        subjectType: SubjectType.CUSTOMER,
        subjectId: islandB.customerId,
        status: BookingStatus.COMPLETED,
        slotStartAt: pastStart,
        slotEndAt: pastEnd,
      },
    });
  });

  afterAll(async () => {
    // cleanupSeeded deletes the customer (cascades bookings) and the counselor
    // (cascades availability slots). No extra cleanup needed.
    await cleanupSeeded(prisma, islandA);
    await cleanupSeeded(prisma, islandB);
    await app.close();
  });

  // ── Island A assertions ────────────────────────────────────────────────────

  describe('Island A — scope=own funnel counts', () => {
    it('returns correct funnel breakdown for counselorA', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/analytics')
        .set('Authorization', `Bearer ${islandA.counselorToken}`);

      expect(res.status).toBe(200);

      const { funnel } = res.body as {
        funnel: {
          booked: number;
          confirmed: number;
          completed: number;
          noShow: number;
          cancelled: number;
        };
      };

      expect(funnel).toBeDefined();
      // slotA1 → COMPLETED, slotA2 → NO_SHOW; no PENDING/CONFIRMED/CANCELLED
      expect(funnel.completed).toBe(1);
      expect(funnel.noShow).toBe(1);
      expect(funnel.booked).toBe(0);
      expect(funnel.confirmed).toBe(0);
      expect(funnel.cancelled).toBe(0);
    });

    it('noShowRate = 0.5 for counselorA', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/analytics')
        .set('Authorization', `Bearer ${islandA.counselorToken}`);

      expect(res.status).toBe(200);
      // noShowRate = 1 / (1 + 1) = 0.5
      expect((res.body as { noShowRate: number }).noShowRate).toBeCloseTo(0.5);
    });

    it('slotUtilization = 2/3 for counselorA (3 past isOpen, 2 with bookings)', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/analytics')
        .set('Authorization', `Bearer ${islandA.counselorToken}`);

      expect(res.status).toBe(200);
      // 3 past isOpen slots; 2 have non-CANCELLED bookings → 2/3
      expect(
        (res.body as { slotUtilization: number }).slotUtilization,
      ).toBeCloseTo(2 / 3);
    });
  });

  // ── Island B assertions ────────────────────────────────────────────────────

  describe('Island B — scope=own funnel counts', () => {
    it('returns correct funnel breakdown for counselorB', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/analytics')
        .set('Authorization', `Bearer ${islandB.counselorToken}`);

      expect(res.status).toBe(200);

      const { funnel } = res.body as {
        funnel: { completed: number; noShow: number };
      };

      expect(funnel.completed).toBe(2);
      expect(funnel.noShow).toBe(0);
    });

    it('noShowRate = 0 for counselorB (zero NO_SHOW)', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/analytics')
        .set('Authorization', `Bearer ${islandB.counselorToken}`);

      expect(res.status).toBe(200);
      expect((res.body as { noShowRate: number }).noShowRate).toBe(0);
    });

    it('slotUtilization = 1.0 for counselorB (2 past isOpen, both utilised)', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/analytics')
        .set('Authorization', `Bearer ${islandB.counselorToken}`);

      expect(res.status).toBe(200);
      expect(
        (res.body as { slotUtilization: number }).slotUtilization,
      ).toBeCloseTo(1);
    });
  });

  // ── Cross-island scope isolation ───────────────────────────────────────────

  describe('scope isolation — B data must not bleed into A view', () => {
    it('counselorA funnel.completed is 1, not 1+2=3', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/analytics')
        .set('Authorization', `Bearer ${islandA.counselorToken}`);

      expect(res.status).toBe(200);
      // Island B has 2 COMPLETED; those must not inflate A's count.
      expect(
        (res.body as { funnel: { completed: number } }).funnel.completed,
      ).toBe(1);
    });

    it('counselorA slotUtilization is ~0.667, not inflated by B slots', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/analytics')
        .set('Authorization', `Bearer ${islandA.counselorToken}`);

      expect(res.status).toBe(200);
      // B has 2/2 = 1.0; A must still see 2/3.
      const util = (res.body as { slotUtilization: number }).slotUtilization;
      expect(util).toBeGreaterThan(0.6);
      expect(util).toBeLessThan(0.7);
    });
  });

  // ── Zero-denominator guard ─────────────────────────────────────────────────

  describe('zero-denominator guards', () => {
    it('all rate fields are numbers (not NaN/null/undefined)', async () => {
      // Either island's scoped view will have data, but we verify the shape.
      const res = await request(app.getHttpServer())
        .get('/admin/analytics')
        .set('Authorization', `Bearer ${islandA.counselorToken}`);

      expect(res.status).toBe(200);
      const body = res.body as {
        noShowRate: unknown;
        slotUtilization: unknown;
      };
      expect(typeof body.noShowRate).toBe('number');
      expect(typeof body.slotUtilization).toBe('number');
      expect(Number.isFinite(body.noShowRate as number)).toBe(true);
      expect(Number.isFinite(body.slotUtilization as number)).toBe(true);
    });
  });
});
