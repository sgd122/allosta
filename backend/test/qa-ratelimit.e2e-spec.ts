import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  bootTestApp,
  cleanupSeeded,
  seedIsolated,
  SeededData,
} from './helpers/test-app';

/**
 * Per-customer rate limiting on the QA write endpoints (ADR 0018 security
 * hardening). The QaService in-flight cap protects the single local LLM from
 * pile-up but does NOT bound row creation — QaThrottlerGuard does, keyed on the
 * authenticated customerId (not IP), so one customer hitting the cap never
 * throttles another.
 *
 * The throttle window/limit is read by ThrottlerModule.forRootAsync at app
 * instantiation, so this spec sets a small limit BEFORE bootTestApp() and
 * restores the original env in afterAll (the suite runs maxWorkers:1, so env
 * mutation would otherwise leak into later files).
 */
describe('Q&A per-customer rate limiting (ADR 0018)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let islandA: SeededData;
  let islandB: SeededData;

  const ORIGINAL_LIMIT = process.env.QA_RATELIMIT_LIMIT;
  const LIMIT = 3;

  beforeAll(async () => {
    process.env.QA_RATELIMIT_LIMIT = String(LIMIT);
    const ctx = await bootTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    islandA = await seedIsolated(prisma, ctx.signToken);
    islandB = await seedIsolated(prisma, ctx.signToken);
  });

  afterAll(async () => {
    if (ORIGINAL_LIMIT === undefined) {
      delete process.env.QA_RATELIMIT_LIMIT;
    } else {
      process.env.QA_RATELIMIT_LIMIT = ORIGINAL_LIMIT;
    }
    await cleanupSeeded(prisma, islandA);
    await cleanupSeeded(prisma, islandB);
    await app.close();
  });

  const openSession = (island: SeededData) =>
    request(app.getHttpServer())
      .post('/qa/sessions')
      .set('Authorization', `Bearer ${island.customerToken}`)
      .send({ testResultId: island.testResultId });

  it('returns 429 once a customer exceeds the write limit', async () => {
    for (let i = 0; i < LIMIT; i += 1) {
      const ok = await openSession(islandA);
      expect(ok.status).toBe(201);
    }
    const blocked = await openSession(islandA);
    expect(blocked.status).toBe(429);
  });

  it('scopes the limit per customer — a second customer is unaffected', async () => {
    // islandA is already over its cap from the previous test; islandB shares the
    // same loopback IP but a distinct customerId, so its first write still passes.
    const res = await openSession(islandB);
    expect(res.status).toBe(201);
  });
});
