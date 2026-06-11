import { INestApplication } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  bootTestApp,
  cleanupSeeded,
  seedIsolated,
  SeededData,
} from './helpers/test-app';

/**
 * AC2 — concurrency safety (the highest design-signal test).
 *
 * Fire N concurrent POST /bookings against the SAME open slot as the SAME
 * customer. The partial unique index `booking_slot_active_unique` plus the
 * insert-first / catch-23505 pattern must allow EXACTLY ONE to win; every
 * other request must map the Postgres unique violation to a 409. The DB must
 * end with exactly one ACTIVE ({PENDING, CONFIRMED}) booking for that slot.
 */
describe('AC2 booking concurrency (insert-first / catch 23505 -> 409)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seeded: SeededData;

  const CONCURRENT_REQUESTS = 20;

  beforeAll(async () => {
    const ctx = await bootTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    seeded = await seedIsolated(prisma, ctx.signToken, { slotCount: 1 });
  });

  afterAll(async () => {
    await cleanupSeeded(prisma, seeded);
    await app.close();
  });

  it('confirms exactly one booking and rejects the rest with 409 under concurrent load', async () => {
    const slotId = seeded.slotIds[0];

    // Fire all requests simultaneously against the same slot/customer/subject.
    const responses = await Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }).map(() =>
        request(app.getHttpServer())
          .post('/bookings')
          .set('Authorization', `Bearer ${seeded.customerToken}`)
          .send({
            slotId,
            testResultId: seeded.testResultId,
          }),
      ),
    );

    const created = responses.filter((r) => r.status === 201);
    const conflicts = responses.filter((r) => r.status === 409);
    const others = responses.filter(
      (r) => r.status !== 201 && r.status !== 409,
    );

    // Exactly one winner, the rest are conflicts, nothing unexpected.
    expect(created).toHaveLength(1);
    expect(conflicts).toHaveLength(CONCURRENT_REQUESTS - 1);
    expect(others).toHaveLength(0);

    // DB proof: a single ACTIVE ({PENDING, CONFIRMED}) booking exists for the slot.
    const activeCount = await prisma.booking.count({
      where: {
        slotId,
        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
      },
    });
    expect(activeCount).toBe(1);

    // Log the load-bearing result line for the report.
    // eslint-disable-next-line no-console
    console.log(
      `[AC2] ${created.length}x201 / ${conflicts.length}x409 / db ACTIVE count=${activeCount}`,
    );
  });
});
