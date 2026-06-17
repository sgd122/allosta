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
 * Fail-soft fallback (AC4). The test env points OLLAMA_BASE_URL at a dead
 * loopback port (jest-setup-env.ts), so the synchronous LLM call fails and the
 * service must degrade to a deterministic template answer — a 200 with a
 * FALLBACK_* source and a usable answer, never an error to the customer.
 */
describe('Q&A fallback when the LLM is unavailable (AC4)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seeded: SeededData;

  beforeAll(async () => {
    const ctx = await bootTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    seeded = await seedIsolated(prisma, ctx.signToken);
  });

  afterAll(async () => {
    await cleanupSeeded(prisma, seeded);
    await app.close();
  });

  it('returns a grounded template answer (FALLBACK_UNAVAILABLE), not an error', async () => {
    const session = await request(app.getHttpServer())
      .post('/qa/sessions')
      .set('Authorization', `Bearer ${seeded.customerToken}`)
      .send({ testResultId: seeded.testResultId });

    const res = await request(app.getHttpServer())
      .post(`/qa/sessions/${session.body.id}/messages`)
      .set('Authorization', `Bearer ${seeded.customerToken}`)
      .send({ question: 'focus_index 수치 해석해 주세요.' });

    expect(res.status).toBe(201);
    expect(res.body.source).toBe('FALLBACK_UNAVAILABLE');
    expect(res.body.text.length).toBeGreaterThan(0);
    expect(res.body.groundedMetricRefs).toContain(seeded.testResultMetricKey);
  });
});
