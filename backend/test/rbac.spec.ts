import { INestApplication } from '@nestjs/common';
import { Outcome } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  bootTestApp,
  cleanupSeeded,
  seedIsolated,
  SeededData,
} from './helpers/test-app';

/**
 * AC7 (role layer) + AC7b (resource-ownership layer).
 *
 * Two distinct authorization layers are exercised:
 *  - RolesGuard: "may this ROLE call this endpoint?" (403 on wrong role).
 *  - OwnershipService: "does this resource belong to this user?" (403 on
 *    foreign family member / foreign booking).
 *  - JwtAuthGuard: "is the caller authenticated?" (401 with no token).
 */
describe('AC7 / AC7b authorization (role + ownership)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  // counselorA owns the seeded slot; counselorB is a foreign counselor.
  let islandA: SeededData;
  let islandB: SeededData;

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

  describe('AC7 role layer', () => {
    // ── GET /counselors/slots (own slot management) ───────────────────────────
    it('returns 403 when a CUSTOMER token requests GET /counselors/slots', async () => {
      const res = await request(app.getHttpServer())
        .get('/counselors/slots')
        .set('Authorization', `Bearer ${islandA.customerToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 200 with own slots when a COUNSELOR token requests GET /counselors/slots', async () => {
      const res = await request(app.getHttpServer())
        .get('/counselors/slots')
        .set('Authorization', `Bearer ${islandA.counselorToken}`);

      // Counselor A owns the slot seeded by islandA; the response must be an
      // array and must NOT contain any slot owned by counselor B.
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const counselorIds: string[] = (res.body as { counselorId: string }[]).map(
        (s) => s.counselorId,
      );
      for (const id of counselorIds) {
        expect(id).toBe(islandA.counselorId);
      }
    });

    it('returns 403 when a CUSTOMER token requests GET /admin/analytics', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/analytics')
        .set('Authorization', `Bearer ${islandA.customerToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 401 when GET /me is called with no token', async () => {
      const res = await request(app.getHttpServer()).get('/me');

      expect(res.status).toBe(401);
    });

    it("returns 403 when counselor-A posts a record for counselor-B's booking", async () => {
      // Customer of island B books a slot owned by counselor B.
      const booking = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${islandB.customerToken}`)
        .send({
          slotId: islandB.slotIds[0],
          testResultId: islandB.testResultId,
        });
      expect(booking.status).toBe(201);

      // Counselor A (a valid COUNSELOR role) tries to record on B's booking.
      const res = await request(app.getHttpServer())
        .post('/consultation-records')
        .set('Authorization', `Bearer ${islandA.counselorToken}`)
        .send({
          bookingId: booking.body.id,
          summary: 'cross-counselor attempt',
          recommendation: '권고 사항',
          actions: [],
          outcome: Outcome.PURCHASED,
          interestedProductIds: [],
        });

      // Passes the role check (COUNSELOR) but fails ownership (AC7b) -> 403.
      expect(res.status).toBe(403);
    });
  });

  describe('AC7b ownership layer', () => {
    it('returns 403 when a customer books a test-result subject they do not own', async () => {
      // islandA customer tries to book islandB's test result. The subject is
      // derived from the test result (islandB's customer), so the server's
      // ownership re-check rejects islandA -> 403.
      const res = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${islandA.customerToken}`)
        .send({
          slotId: islandA.slotIds[0],
          testResultId: islandB.testResultId,
        });

      expect(res.status).toBe(403);
    });

    it('returns 403 when a non-assigned counselor records on a booking', async () => {
      // Customer A books slot A (owned by counselor A).
      const booking = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${islandA.customerToken}`)
        .send({
          slotId: islandA.slotIds[0],
          testResultId: islandA.testResultId,
        });
      expect(booking.status).toBe(201);

      // Counselor B (not assigned to this booking) attempts the record.
      const res = await request(app.getHttpServer())
        .post('/consultation-records')
        .set('Authorization', `Bearer ${islandB.counselorToken}`)
        .send({
          bookingId: booking.body.id,
          summary: 'unassigned counselor attempt',
          recommendation: '권고 사항',
          actions: [],
          outcome: Outcome.GUIDED,
          interestedProductIds: [],
        });

      expect(res.status).toBe(403);
    });
  });
});
