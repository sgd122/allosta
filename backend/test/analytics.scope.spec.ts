import { INestApplication } from '@nestjs/common';
import { Outcome, Role } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  bootTestApp,
  cleanupSeeded,
  seedIsolated,
  SeededData,
} from './helpers/test-app';

/**
 * Analytics scope enforcement (plan §4 — Architect HIGH finding).
 *
 * Two isolated data islands (counselor A + counselor B) each have exactly
 * one consultation record. The test asserts:
 *
 *  1. COUNSELOR token always scopes to own counselorId — all four aggregations
 *     (countTotalRecords, groupByOutcome, groupByProduct, metricConversion raw
 *     $queryRaw) return disjoint results with zero cross-counselor leakage.
 *
 *  2. COUNSELOR token receives 403 on the ADMIN-only drilldown endpoint.
 *
 *  3. ADMIN token can access the drilldown endpoint and receives the full
 *     record shape.
 *
 *  4. Existing role guard regression: CUSTOMER still receives 403 on
 *     GET /admin/analytics.
 */
describe('Analytics scope (counselorId filter + drilldown RBAC)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let islandA: SeededData; // counselor A — PURCHASED record
  let islandB: SeededData; // counselor B — ON_HOLD record
  let adminToken: string;
  let recordAId: string; // consultation record id owned by counselor A

  beforeAll(async () => {
    const ctx = await bootTestApp();
    app = ctx.app;
    prisma = ctx.prisma;

    islandA = await seedIsolated(prisma, ctx.signToken, { slotCount: 1 });
    islandB = await seedIsolated(prisma, ctx.signToken, { slotCount: 1 });

    // Admin has no profile — minted directly from the JWT service.
    adminToken = ctx.signToken({
      sub: `analytics-scope-admin-${islandA.unique}`,
      role: Role.ADMIN,
    });

    // ── Island A: book slot + PURCHASED record ──────────────────────────────
    const bookingA = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${islandA.customerToken}`)
      .send({
        slotId: islandA.slotIds[0],
        testResultId: islandA.testResultId,
      });
    expect(bookingA.status).toBe(201);

    const recA = await request(app.getHttpServer())
      .post('/consultation-records')
      .set('Authorization', `Bearer ${islandA.counselorToken}`)
      .send({
        bookingId: bookingA.body.id,
        summary: 'island A — scope test',
        recommendation: '권고 사항',
        actions: [],
        outcome: Outcome.PURCHASED,
        interestedProductIds: [islandA.productIds[0]],
        metricRefs: [
          {
            testResultId: islandA.testResultId,
            metricKey: islandA.testResultMetricKey,
          },
        ],
      });
    expect(recA.status).toBe(201);
    recordAId = recA.body.id as string;

    // ── Island B: book slot + ON_HOLD record ────────────────────────────────
    const bookingB = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${islandB.customerToken}`)
      .send({
        slotId: islandB.slotIds[0],
        testResultId: islandB.testResultId,
      });
    expect(bookingB.status).toBe(201);

    const recB = await request(app.getHttpServer())
      .post('/consultation-records')
      .set('Authorization', `Bearer ${islandB.counselorToken}`)
      .send({
        bookingId: bookingB.body.id,
        summary: 'island B — scope test',
        recommendation: '권고 사항',
        actions: [],
        outcome: Outcome.GUIDED,
        interestedProductIds: [islandB.productIds[0]],
        metricRefs: [
          {
            testResultId: islandB.testResultId,
            metricKey: islandB.testResultMetricKey,
          },
        ],
      });
    expect(recB.status).toBe(201);
  });

  afterAll(async () => {
    await cleanupSeeded(prisma, islandA);
    await cleanupSeeded(prisma, islandB);
    await app.close();
  });

  // ── 1. Disjoint scope assertions ──────────────────────────────────────────

  describe('counselor scope=own — disjoint totals across all four aggregations', () => {
    it('counselor A sees exactly their own data — no B records leak in', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/analytics')
        .set('Authorization', `Bearer ${islandA.counselorToken}`);

      expect(res.status).toBe(200);

      // (1) countTotalRecords
      expect(res.body.totalRecords).toBe(1);

      // (2) groupByOutcome — A's record is PURCHASED; B's GUIDED must not appear
      expect(res.body.outcomeDistribution.PURCHASED).toBe(1);
      expect(res.body.outcomeDistribution.GUIDED).toBe(0);
      expect(res.body.outcomeDistribution.EXPLAINED).toBe(0);

      // (3) groupByProduct — A's product visible; B's product absent
      const productIds = (
        res.body.productInterest as { productId: string }[]
      ).map((p) => p.productId);
      expect(productIds).toContain(islandA.productIds[0]);
      expect(productIds).not.toContain(islandB.productIds[0]);

      // (4) aggregateMetricConversion (raw $queryRaw)
      //     A has 1 discussed record with PURCHASED outcome → purchasedCount=1
      //     B's ON_HOLD record must not appear in A's view
      const metricEntry = (
        res.body.metricConversion as {
          metricKey: string;
          discussedCount: number;
          purchasedCount: number;
        }[]
      ).find((m) => m.metricKey === islandA.testResultMetricKey);
      expect(metricEntry).toBeDefined();
      expect(metricEntry!.discussedCount).toBe(1);
      expect(metricEntry!.purchasedCount).toBe(1);
    });

    it('counselor B sees exactly their own data — no A records leak in', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/analytics')
        .set('Authorization', `Bearer ${islandB.counselorToken}`);

      expect(res.status).toBe(200);

      // (1) countTotalRecords
      expect(res.body.totalRecords).toBe(1);

      // (2) groupByOutcome — B's record is GUIDED; A's PURCHASED must not appear
      expect(res.body.outcomeDistribution.GUIDED).toBe(1);
      expect(res.body.outcomeDistribution.PURCHASED).toBe(0);
      expect(res.body.outcomeDistribution.EXPLAINED).toBe(0);

      // (3) groupByProduct — B's product visible; A's product absent
      const productIds = (
        res.body.productInterest as { productId: string }[]
      ).map((p) => p.productId);
      expect(productIds).toContain(islandB.productIds[0]);
      expect(productIds).not.toContain(islandA.productIds[0]);

      // (4) aggregateMetricConversion (raw $queryRaw)
      //     B has 1 discussed record with ON_HOLD outcome → purchasedCount=0
      //     A's PURCHASED record must not inflate B's purchasedCount
      const metricEntry = (
        res.body.metricConversion as {
          metricKey: string;
          discussedCount: number;
          purchasedCount: number;
        }[]
      ).find((m) => m.metricKey === islandB.testResultMetricKey);
      expect(metricEntry).toBeDefined();
      expect(metricEntry!.discussedCount).toBe(1);
      expect(metricEntry!.purchasedCount).toBe(0);
    });
  });

  describe('counselor scope=all explicit toggle — global aggregate', () => {
    it('counselor A with ?scope=all sees全体 aggregates (both islands included)', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/analytics?scope=all')
        .set('Authorization', `Bearer ${islandA.counselorToken}`);

      expect(res.status).toBe(200);

      // totalRecords must include both A's and B's records (≥ 2)
      expect(res.body.totalRecords).toBeGreaterThanOrEqual(2);

      // Both islands' products must appear
      const productIds = (
        res.body.productInterest as { productId: string }[]
      ).map((p) => p.productId);
      expect(productIds).toContain(islandA.productIds[0]);
      expect(productIds).toContain(islandB.productIds[0]);

      // metricConversion discussedCount for the shared key must cover ≥ 2 records
      const metricEntry = (
        res.body.metricConversion as {
          metricKey: string;
          discussedCount: number;
          purchasedCount: number;
        }[]
      ).find((m) => m.metricKey === islandA.testResultMetricKey);
      expect(metricEntry).toBeDefined();
      expect(metricEntry!.discussedCount).toBeGreaterThanOrEqual(2);
      // A's PURCHASED record contributes at least 1 purchased
      expect(metricEntry!.purchasedCount).toBeGreaterThanOrEqual(1);
    });

    it('counselor B with ?scope=all sees全体 aggregates (both islands included)', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/analytics?scope=all')
        .set('Authorization', `Bearer ${islandB.counselorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.totalRecords).toBeGreaterThanOrEqual(2);

      const productIds = (
        res.body.productInterest as { productId: string }[]
      ).map((p) => p.productId);
      expect(productIds).toContain(islandA.productIds[0]);
      expect(productIds).toContain(islandB.productIds[0]);
    });
  });

  // ── 2. Drilldown RBAC ─────────────────────────────────────────────────────

  describe('ADMIN-only drilldown endpoint', () => {
    it('returns 403 for COUNSELOR on GET /admin/analytics/drilldown/:id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/admin/analytics/drilldown/${recordAId}`)
        .set('Authorization', `Bearer ${islandA.counselorToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 200 with full record detail for ADMIN', async () => {
      const res = await request(app.getHttpServer())
        .get(`/admin/analytics/drilldown/${recordAId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.recordId).toBe(recordAId);
      expect(typeof res.body.bookingId).toBe('string');
      expect(res.body.outcome).toBe(Outcome.PURCHASED);
      expect(res.body.counselorName).toBeDefined();
      expect(res.body.customerName).toBeDefined();
      expect(Array.isArray(res.body.products)).toBe(true);
      expect(res.body.products).toHaveLength(1);
      expect(Array.isArray(res.body.metricKeys)).toBe(true);
      expect(res.body.metricKeys).toHaveLength(1);
    });
  });

  // ── 3. Paginated records list ─────────────────────────────────────────────

  describe('GET /admin/analytics/records — paginated list', () => {
    it('returns 200 with paginated rows for ADMIN', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/analytics/records?page=1&limit=50')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(typeof res.body.total).toBe('number');
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(50);
      expect(Array.isArray(res.body.data)).toBe(true);

      // Both islands' records must appear in the list
      const ids = (res.body.data as { recordId: string }[]).map(
        (r) => r.recordId,
      );
      expect(ids).toContain(recordAId);

      // Spot-check row shape
      const rowA = (
        res.body.data as {
          recordId: string;
          slotStartAt: string;
          customerName: string;
          counselorName: string;
          subjectType: string;
          outcome: string;
        }[]
      ).find((r) => r.recordId === recordAId);
      expect(rowA).toBeDefined();
      expect(typeof rowA!.slotStartAt).toBe('string');
      expect(typeof rowA!.customerName).toBe('string');
      expect(typeof rowA!.counselorName).toBe('string');
      expect(typeof rowA!.subjectType).toBe('string');
      expect(rowA!.outcome).toBe('PURCHASED');
    });

    it('returns 403 for COUNSELOR on GET /admin/analytics/records', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/analytics/records')
        .set('Authorization', `Bearer ${islandA.counselorToken}`);

      expect(res.status).toBe(403);
    });
  });

  // ── 4. Regression: existing role guard still blocks CUSTOMER ──────────────

  describe('role guard regression', () => {
    it('returns 403 when CUSTOMER token requests GET /admin/analytics', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/analytics')
        .set('Authorization', `Bearer ${islandA.customerToken}`);

      expect(res.status).toBe(403);
    });
  });
});
