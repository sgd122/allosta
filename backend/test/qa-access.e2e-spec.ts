import { INestApplication } from '@nestjs/common';
import { FamilyLinkStatus } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  bootTestApp,
  cleanupSeeded,
  seedIsolated,
  SeededData,
} from './helpers/test-app';

/**
 * Access control (AC11). A customer can only query the AI about reports they own
 * or have ACCEPTED family-consent access to — mirroring GET /test-results. Two
 * isolated islands (A, B); B must be refused A's report unless an ACCEPTED
 * FamilyLink exists. Plus PATCH/GET IDOR guards on sessions and messages.
 */
describe('Q&A access control (AC11)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let islandA: SeededData;
  let islandB: SeededData;

  beforeAll(async () => {
    const ctx = await bootTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    islandA = await seedIsolated(prisma, ctx.signToken);
    islandB = await seedIsolated(prisma, ctx.signToken);
  });

  afterAll(async () => {
    await cleanupSeeded(prisma, islandA);
    await cleanupSeeded(prisma, islandB);
    await app.close();
  });

  it('refuses a session on a non-owned, non-consented report (403)', async () => {
    const res = await request(app.getHttpServer())
      .post('/qa/sessions')
      .set('Authorization', `Bearer ${islandB.customerToken}`)
      .send({ testResultId: islandA.testResultId });
    expect(res.status).toBe(403);
  });

  it('allows a session on a family-consented report (ACCEPTED FamilyLink)', async () => {
    const [low, high] =
      islandA.customerId < islandB.customerId
        ? [islandA.customerId, islandB.customerId]
        : [islandB.customerId, islandA.customerId];
    await prisma.familyLink.create({
      data: {
        inviterCustomerId: islandA.customerId,
        inviteeCustomerId: islandB.customerId,
        customerLowId: low,
        customerHighId: high,
        code: `link-${islandA.unique}-${islandB.unique}`,
        status: FamilyLinkStatus.ACCEPTED,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        acceptedAt: new Date(),
      },
    });

    const res = await request(app.getHttpServer())
      .post('/qa/sessions')
      .set('Authorization', `Bearer ${islandB.customerToken}`)
      .send({ testResultId: islandA.testResultId });
    expect(res.status).toBe(201);
  });

  it('guards session reads against IDOR (403)', async () => {
    const session = await request(app.getHttpServer())
      .post('/qa/sessions')
      .set('Authorization', `Bearer ${islandA.customerToken}`)
      .send({ testResultId: islandA.testResultId });

    const stolen = await request(app.getHttpServer())
      .get(`/qa/sessions/${session.body.id}`)
      .set('Authorization', `Bearer ${islandB.customerToken}`);
    expect(stolen.status).toBe(403);
  });

  it('guards feedback PATCH against IDOR (403)', async () => {
    const session = await request(app.getHttpServer())
      .post('/qa/sessions')
      .set('Authorization', `Bearer ${islandA.customerToken}`)
      .send({ testResultId: islandA.testResultId });
    const answer = await request(app.getHttpServer())
      .post(`/qa/sessions/${session.body.id}/messages`)
      .set('Authorization', `Bearer ${islandA.customerToken}`)
      .send({ question: 'focus_index 해석해 주세요.' });

    const stolen = await request(app.getHttpServer())
      .patch(`/qa/messages/${answer.body.id}/feedback`)
      .set('Authorization', `Bearer ${islandB.customerToken}`)
      .send({ feedback: 'YES' });
    expect(stolen.status).toBe(403);
  });

  it('cuts off an existing family session the instant consent is revoked (AC11, live)', async () => {
    // Clean slate: drop any A–B link left over from earlier tests so this case
    // is governed solely by the link we create and then revoke.
    const between = {
      OR: [
        {
          inviterCustomerId: islandA.customerId,
          inviteeCustomerId: islandB.customerId,
        },
        {
          inviterCustomerId: islandB.customerId,
          inviteeCustomerId: islandA.customerId,
        },
      ],
    };
    await prisma.familyLink.deleteMany({ where: between });

    const [low, high] =
      islandA.customerId < islandB.customerId
        ? [islandA.customerId, islandB.customerId]
        : [islandB.customerId, islandA.customerId];
    await prisma.familyLink.create({
      data: {
        inviterCustomerId: islandA.customerId,
        inviteeCustomerId: islandB.customerId,
        customerLowId: low,
        customerHighId: high,
        code: `link-revoke-${islandA.unique}-${islandB.unique}`,
        status: FamilyLinkStatus.ACCEPTED,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        acceptedAt: new Date(),
      },
    });

    // B opens a session on A's family-consented report — allowed while linked.
    const created = await request(app.getHttpServer())
      .post('/qa/sessions')
      .set('Authorization', `Bearer ${islandB.customerToken}`)
      .send({ testResultId: islandA.testResultId });
    expect(created.status).toBe(201);
    const sessionId = created.body.id as string;

    // Consent is revoked AFTER the session exists.
    await prisma.familyLink.deleteMany({ where: between });

    // The previously valid session must now refuse both reads and asks — no
    // further access to A's metrics through the stale session.
    const read = await request(app.getHttpServer())
      .get(`/qa/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${islandB.customerToken}`);
    expect(read.status).toBe(403);

    const ask = await request(app.getHttpServer())
      .post(`/qa/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${islandB.customerToken}`)
      .send({ question: 'focus_index 해석해 주세요.' });
    expect(ask.status).toBe(403);
  });
});
