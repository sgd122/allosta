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
 * AC5 — challenge analytics on the admin dashboard, scoped through the RECORD's
 * counselorId (analytics change #9).
 *
 * Three disjoint islands, each with its own counselor, so COUNSELOR-token
 * (scope=own) views never leak across islands:
 *   - island A: one PURCHASED record WITH a challengeId   → enrolled
 *       ⇒ challengeEnrollments === 1, challengeConversionRate === 1
 *   - island B: one PURCHASED record WITHOUT a challengeId → not enrolled
 *       ⇒ challengeEnrollments === 0, challengeConversionRate === 0
 *   - island C: one non-PURCHASED (GUIDED) record         → no purchased data
 *       ⇒ challengeEnrollments === 0, challengeConversionRate === null
 */
describe('Challenge analytics (AC5 — scoped conversion + 0-vs-null)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let islandA: SeededData; // PURCHASED + enrolled
  let islandB: SeededData; // PURCHASED, no enrollment
  let islandC: SeededData; // no PURCHASED records

  beforeAll(async () => {
    const ctx = await bootTestApp();
    app = ctx.app;
    prisma = ctx.prisma;

    islandA = await seedIsolated(prisma, ctx.signToken, { slotCount: 1 });
    islandB = await seedIsolated(prisma, ctx.signToken, { slotCount: 1 });
    islandC = await seedIsolated(prisma, ctx.signToken, { slotCount: 1 });

    // ── Island A: PURCHASED record WITH a challengeId (enrolled) ──────────────
    const bookingA = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${islandA.customerToken}`)
      .send({ slotId: islandA.slotIds[0], testResultId: islandA.testResultId });
    expect(bookingA.status).toBe(201);

    const recA = await request(app.getHttpServer())
      .post('/consultation-records')
      .set('Authorization', `Bearer ${islandA.counselorToken}`)
      .send({
        bookingId: bookingA.body.id,
        summary: 'island A — purchased + enrolled',
        recommendation: '권고 사항',
        actions: [],
        outcome: Outcome.PURCHASED,
        interestedProductIds: [],
        challengeId: islandA.challengeId,
      });
    expect(recA.status).toBe(201);

    // ── Island B: PURCHASED record WITHOUT a challengeId (not enrolled) ───────
    const bookingB = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${islandB.customerToken}`)
      .send({ slotId: islandB.slotIds[0], testResultId: islandB.testResultId });
    expect(bookingB.status).toBe(201);

    const recB = await request(app.getHttpServer())
      .post('/consultation-records')
      .set('Authorization', `Bearer ${islandB.counselorToken}`)
      .send({
        bookingId: bookingB.body.id,
        summary: 'island B — purchased, no enrollment',
        recommendation: '권고 사항',
        actions: [],
        outcome: Outcome.PURCHASED,
        interestedProductIds: [],
      });
    expect(recB.status).toBe(201);

    // ── Island C: GUIDED record (no PURCHASED records at all) ─────────────────
    const bookingC = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${islandC.customerToken}`)
      .send({ slotId: islandC.slotIds[0], testResultId: islandC.testResultId });
    expect(bookingC.status).toBe(201);

    const recC = await request(app.getHttpServer())
      .post('/consultation-records')
      .set('Authorization', `Bearer ${islandC.counselorToken}`)
      .send({
        bookingId: bookingC.body.id,
        summary: 'island C — guided only',
        recommendation: '권고 사항',
        actions: [],
        outcome: Outcome.GUIDED,
        interestedProductIds: [],
      });
    expect(recC.status).toBe(201);
  });

  afterAll(async () => {
    await cleanupSeeded(prisma, islandA);
    await cleanupSeeded(prisma, islandB);
    await cleanupSeeded(prisma, islandC);
    await app.close();
  });

  it('counselor A (scope=own): 1 enrollment, conversion 1 — and no B data leaks in', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/analytics')
      .set('Authorization', `Bearer ${islandA.counselorToken}`);

    expect(res.status).toBe(200);
    // One PURCHASED record, one enrollment → fully converted.
    expect(res.body.challengeEnrollments).toBe(1);
    expect(res.body.challengeConversionRate).toBe(1);
  });

  it('counselor B (scope=own): purchased but unenrolled — 0 enrollments, conversion 0', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/analytics')
      .set('Authorization', `Bearer ${islandB.counselorToken}`);

    expect(res.status).toBe(200);
    // B has a PURCHASED record but enrolled nobody → 0 (NOT null).
    expect(res.body.challengeEnrollments).toBe(0);
    expect(res.body.challengeConversionRate).toBe(0);
  });

  it('counselor C (scope=own): no purchased records — conversion is null', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/analytics')
      .set('Authorization', `Bearer ${islandC.counselorToken}`);

    expect(res.status).toBe(200);
    // No PURCHASED records → "no data" sentinel null, distinct from B's 0.
    expect(res.body.challengeEnrollments).toBe(0);
    expect(res.body.challengeConversionRate).toBeNull();
  });

  it('A and B are disjoint: B never sees A’s enrollment', async () => {
    const resB = await request(app.getHttpServer())
      .get('/admin/analytics')
      .set('Authorization', `Bearer ${islandB.counselorToken}`);

    expect(resB.status).toBe(200);
    // A's single enrollment must not bleed into B's scoped count.
    expect(resB.body.challengeEnrollments).toBe(0);
  });
});
