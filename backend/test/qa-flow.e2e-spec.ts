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
 * Q&A core flow (AC2/3/7/9). Ollama is unreachable in the test env (see
 * jest-setup-env.ts), so every answer is the deterministic template — perfect
 * for asserting grounding + persistence without a live model.
 */
describe('Q&A flow (AC2/3/7/9)', () => {
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

  const auth = () => `Bearer ${seeded.customerToken}`;

  it('opens a session, answers grounded multi-turn questions, persists, and rates (AC2/3/9/7)', async () => {
    // AC1/AC9: open a session scoped to the customer's own report.
    const created = await request(app.getHttpServer())
      .post('/qa/sessions')
      .set('Authorization', auth())
      .send({ testResultId: seeded.testResultId });
    expect(created.status).toBe(201);
    expect(created.body.testResultId).toBe(seeded.testResultId);
    const sessionId = created.body.id as string;

    // AC2/AC3: ask an in-scope question — grounded on the customer's own metric.
    const q1 = await request(app.getHttpServer())
      .post(`/qa/sessions/${sessionId}/messages`)
      .set('Authorization', auth())
      .send({ question: 'focus_index 수치가 무슨 뜻인가요?' });
    expect(q1.status).toBe(201);
    expect(q1.body.role).toBe('ASSISTANT');
    expect(q1.body.escalate).toBe(false);
    // Grounded on the seeded metric (value 72) — not generic text.
    expect(q1.body.groundedMetricRefs).toContain(seeded.testResultMetricKey);
    expect(q1.body.text).toContain('72');
    const assistantId = q1.body.id as string;

    // AC2: a second question accumulates in the same thread.
    const q2 = await request(app.getHttpServer())
      .post(`/qa/sessions/${sessionId}/messages`)
      .set('Authorization', auth())
      .send({ question: 'stress 수치는 어떤가요?' });
    expect(q2.status).toBe(201);

    // AC9: GET the thread — 2 USER + 2 ASSISTANT, persisted in order.
    const thread = await request(app.getHttpServer())
      .get(`/qa/sessions/${sessionId}`)
      .set('Authorization', auth());
    expect(thread.status).toBe(200);
    const roles = thread.body.messages.map((m: { role: string }) => m.role);
    expect(roles).toEqual(['USER', 'ASSISTANT', 'USER', 'ASSISTANT']);

    // Atomicity invariant ($transaction): equal USER/ASSISTANT counts — no
    // orphan USER row was ever left behind.
    const userCount = roles.filter((r: string) => r === 'USER').length;
    const assistantCount = roles.filter((r: string) => r === 'ASSISTANT').length;
    expect(userCount).toBe(assistantCount);

    // AC9: the session appears in the customer's list.
    const list = await request(app.getHttpServer())
      .get('/qa/sessions')
      .set('Authorization', auth());
    expect(list.status).toBe(200);
    expect(list.body.map((s: { id: string }) => s.id)).toContain(sessionId);

    // AC7: rate the assistant answer.
    const rated = await request(app.getHttpServer())
      .patch(`/qa/messages/${assistantId}/feedback`)
      .set('Authorization', auth())
      .send({ feedback: 'YES' });
    expect(rated.status).toBe(200);
    expect(rated.body.feedback).toBe('YES');
  });

  it('declines an out-of-scope question with escalation and never gives advice (AC5/AC6)', async () => {
    const created = await request(app.getHttpServer())
      .post('/qa/sessions')
      .set('Authorization', auth())
      .send({ testResultId: seeded.testResultId });
    const sessionId = created.body.id as string;

    const res = await request(app.getHttpServer())
      .post(`/qa/sessions/${sessionId}/messages`)
      .set('Authorization', auth())
      .send({ question: '이 약 먹어도 되나요?' });
    expect(res.status).toBe(201);
    expect(res.body.escalate).toBe(true);
    expect(res.body.source).toBe('FALLBACK_GUARDRAIL');

    // The USER turn is recorded as out-of-scope; the LLM was never called.
    const thread = await request(app.getHttpServer())
      .get(`/qa/sessions/${sessionId}`)
      .set('Authorization', auth());
    const userTurn = thread.body.messages.find(
      (m: { role: string }) => m.role === 'USER',
    );
    expect(userTurn.inScope).toBe(false);
  });
});
