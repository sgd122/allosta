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
 * AC4/AC8 — challenge enrollment on consultation-record creation.
 *
 * Each test books a fresh slot, confirms it, then records on it. The optional
 * `challengeId` on the record DTO drives a single ChallengeEnrollment, bounded
 * by @@unique([recordId]). Two counselor islands exercise the foreign-booking
 * ownership guard (403). Every booking lives under seedIsolated so cleanup is
 * cascade-driven.
 */
describe('Challenge enrollment (AC4/AC8)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  // islandA owns the seeded slots; islandB is a foreign counselor.
  let islandA: SeededData;
  let islandB: SeededData;

  beforeAll(async () => {
    const ctx = await bootTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    // Several future slots: one per booking the suite creates.
    islandA = await seedIsolated(prisma, ctx.signToken, { slotCount: 5 });
    islandB = await seedIsolated(prisma, ctx.signToken, { slotCount: 1 });
  });

  afterAll(async () => {
    await cleanupSeeded(prisma, islandA);
    await cleanupSeeded(prisma, islandB);
    await app.close();
  });

  /**
   * Books `slotId` as islandA's customer and confirms it as islandA's
   * counselor, returning the CONFIRMED booking id ready to record on.
   */
  async function bookAndConfirm(slotId: string): Promise<string> {
    const booking = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${islandA.customerToken}`)
      .send({ slotId, testResultId: islandA.testResultId });
    expect(booking.status).toBe(201);
    const bookingId = booking.body.id as string;

    const confirm = await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${islandA.counselorToken}`);
    expect(confirm.status).toBe(200);

    return bookingId;
  }

  it('creates exactly one enrollment when a record is posted WITH a challengeId', async () => {
    const bookingId = await bookAndConfirm(islandA.slotIds[0]);

    const record = await request(app.getHttpServer())
      .post('/consultation-records')
      .set('Authorization', `Bearer ${islandA.counselorToken}`)
      .send({
        bookingId,
        summary: 'with challenge',
        recommendation: '권고 사항',
        actions: [],
        outcome: Outcome.PURCHASED,
        interestedProductIds: [],
        challengeId: islandA.challengeId,
      });
    expect(record.status).toBe(201);
    const recordId = record.body.id as string;

    const enrollments = await prisma.challengeEnrollment.findMany({
      where: { recordId },
    });
    expect(enrollments).toHaveLength(1);
    expect(enrollments[0].challengeId).toBe(islandA.challengeId);
    // The enrollee is the booking's customer; the enroller is the counselor.
    expect(enrollments[0].customerId).toBe(islandA.customerId);
    expect(enrollments[0].counselorId).toBe(islandA.counselorId);
  });

  it('creates zero enrollments when a record is posted WITHOUT a challengeId (regression guard)', async () => {
    const bookingId = await bookAndConfirm(islandA.slotIds[1]);

    const record = await request(app.getHttpServer())
      .post('/consultation-records')
      .set('Authorization', `Bearer ${islandA.counselorToken}`)
      .send({
        bookingId,
        summary: 'no challenge',
        recommendation: '권고 사항',
        actions: [],
        outcome: Outcome.GUIDED,
        interestedProductIds: [],
      });
    expect(record.status).toBe(201);
    const recordId = record.body.id as string;

    const count = await prisma.challengeEnrollment.count({
      where: { recordId },
    });
    expect(count).toBe(0);
  });

  it('returns 404 and creates NO record when challengeId does not exist (pre-txn guard)', async () => {
    const bookingId = await bookAndConfirm(islandA.slotIds[2]);

    const record = await request(app.getHttpServer())
      .post('/consultation-records')
      .set('Authorization', `Bearer ${islandA.counselorToken}`)
      .send({
        bookingId,
        summary: 'invalid challenge',
        recommendation: '권고 사항',
        actions: [],
        outcome: Outcome.PURCHASED,
        interestedProductIds: [],
        challengeId: 'does-not-exist',
      });
    expect(record.status).toBe(404);

    // The pre-transaction guard must have prevented any record from being
    // created for this booking.
    const persisted = await prisma.consultationRecord.findUnique({
      where: { bookingId },
      select: { id: true },
    });
    expect(persisted).toBeNull();
  });

  it("returns 403 when a foreign counselor posts a record (with challengeId) on a booking they don't own", async () => {
    const bookingId = await bookAndConfirm(islandA.slotIds[3]);

    // islandB's counselor (valid COUNSELOR role) is not assigned to A's booking.
    const record = await request(app.getHttpServer())
      .post('/consultation-records')
      .set('Authorization', `Bearer ${islandB.counselorToken}`)
      .send({
        bookingId,
        summary: 'foreign counselor attempt',
        recommendation: '권고 사항',
        actions: [],
        outcome: Outcome.PURCHASED,
        interestedProductIds: [],
        challengeId: islandB.challengeId,
      });
    expect(record.status).toBe(403);

    const persisted = await prisma.consultationRecord.findUnique({
      where: { bookingId },
      select: { id: true },
    });
    expect(persisted).toBeNull();
  });

  it('enforces @@unique([recordId]) — a second enrollment row for the same record violates P2002', async () => {
    const bookingId = await bookAndConfirm(islandA.slotIds[4]);

    // First enrollment is created through the normal record path.
    const record = await request(app.getHttpServer())
      .post('/consultation-records')
      .set('Authorization', `Bearer ${islandA.counselorToken}`)
      .send({
        bookingId,
        summary: 'unique guard',
        recommendation: '권고 사항',
        actions: [],
        outcome: Outcome.PURCHASED,
        interestedProductIds: [],
        challengeId: islandA.challengeId,
      });
    expect(record.status).toBe(201);
    const recordId = record.body.id as string;

    // createRecord cannot be driven twice (bookingId @unique → 409), so insert a
    // SECOND enrollment row directly with the SAME recordId (different challenge
    // is fine) and assert the unique constraint rejects it (Prisma P2002).
    await expect(
      prisma.challengeEnrollment.create({
        data: {
          challengeId: islandB.challengeId,
          recordId,
          customerId: islandA.customerId,
          counselorId: islandA.counselorId,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
