import { INestApplication } from '@nestjs/common';
import { Outcome } from '@prisma/client';
import request from 'supertest';
import { JwtPayload } from '../src/common/interfaces/jwt-payload.interface';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  bootTestApp,
  cleanupSeeded,
  seedIsolated,
  SeededData,
} from './helpers/test-app';

/**
 * Pre-mortem #4 — cleanupSeeded must cascade-sweep ChallengeEnrollment rows.
 *
 * ChallengeEnrollment carries cascading FKs to Customer, Counselor, Record, and
 * Challenge. cleanupSeeded deletes the Customer then the Counselor and relies on
 * those cascades. This spec proves that an island holding a record + enrollment
 * tears down without a P2003 foreign-key error and leaves zero enrollment rows.
 */
describe('Cascade cleanup of ChallengeEnrollment (Pre-mortem #4)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let signToken: (payload: JwtPayload) => string;

  beforeAll(async () => {
    const ctx = await bootTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    signToken = ctx.signToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('cleanupSeeded does not throw (no P2003) and sweeps the island enrollment to zero', async () => {
    const island: SeededData = await seedIsolated(prisma, signToken, {
      slotCount: 1,
    });

    // Book + confirm, then record WITH a challengeId so an enrollment exists.
    const booking = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${island.customerToken}`)
      .send({ slotId: island.slotIds[0], testResultId: island.testResultId });
    expect(booking.status).toBe(201);
    const bookingId = booking.body.id as string;

    const confirm = await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${island.counselorToken}`);
    expect(confirm.status).toBe(200);

    const record = await request(app.getHttpServer())
      .post('/consultation-records')
      .set('Authorization', `Bearer ${island.counselorToken}`)
      .send({
        bookingId,
        summary: 'cascade-cleanup record',
        recommendation: '권고 사항',
        actions: [],
        outcome: Outcome.PURCHASED,
        interestedProductIds: [],
        challengeId: island.challengeId,
      });
    expect(record.status).toBe(201);

    // Sanity: the enrollment exists before cleanup.
    const before = await prisma.challengeEnrollment.count({
      where: { customerId: island.customerId, counselorId: island.counselorId },
    });
    expect(before).toBe(1);

    // The actual assertion: cleanup must not throw a FK error (P2003).
    await expect(cleanupSeeded(prisma, island)).resolves.not.toThrow();

    // Cascade swept the enrollment for this island's customer/counselor.
    const after = await prisma.challengeEnrollment.count({
      where: { customerId: island.customerId, counselorId: island.counselorId },
    });
    expect(after).toBe(0);
  });
});
