import { INestApplication } from '@nestjs/common';
import { BookingStatus, Role } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  bootTestApp,
  cleanupSeeded,
  seedIsolated,
  SeededData,
} from './helpers/test-app';

/**
 * Customer temporal self-overlap invariant (ADR 0015).
 *
 * The partial unique index `booking_slot_active_unique` only stops two ACTIVE
 * bookings on the SAME slotId. It does NOT stop one customer from holding two
 * ACTIVE bookings on DIFFERENT slots (different counselors) at the same or
 * overlapping time — a person cannot attend two consultations at once. This is
 * enforced as a time-RANGE overlap by the GiST EXCLUDE constraint
 * `booking_customer_no_overlap` (partial on PENDING/CONFIRMED), with an
 * app-level pre-check for UX. Slot durations vary, so partial overlap counts.
 *
 * These specs assert the invariant against real Postgres.
 */
describe('Customer temporal self-overlap (booking_customer_no_overlap, ADR 0015)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seeded: SeededData;

  // A second counselor + a signing helper so we can place an overlapping slot
  // on a DIFFERENT counselor than the seeded one (the core of the bug).
  let secondCounselorId: string;
  let secondCounselorUserId: string;
  let signToken: (payload: {
    sub: string;
    role: Role;
    counselorId?: string;
    customerId?: string;
  }) => string;

  beforeAll(async () => {
    const ctx = await bootTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    signToken = ctx.signToken;
    // seedIsolated gives counselor #1, the customer, a testResult, etc.
    seeded = await seedIsolated(prisma, ctx.signToken, { slotCount: 0 });

    const secondUser = await prisma.user.create({
      data: {
        email: `${seeded.unique}-counselor2@example.test`,
        passwordHash: '$2b$10$testtesttesttesttesttesteUNUSEDhashplaceholderxxxxxx',
        role: Role.COUNSELOR,
      },
    });
    const secondCounselor = await prisma.counselor.create({
      data: { userId: secondUser.id, name: `Counselor2 ${seeded.unique}`, specialty: 'general' },
    });
    secondCounselorUserId = secondUser.id;
    secondCounselorId = secondCounselor.id;
  });

  afterAll(async () => {
    // Clean the second counselor (cascades its slots) then the seeded island.
    await prisma.counselor.deleteMany({ where: { id: secondCounselorId } });
    await prisma.user.deleteMany({ where: { id: secondCounselorUserId } });
    await cleanupSeeded(prisma, seeded);
    await app.close();
  });

  /** Creates an open future slot on a counselor at the given window (days ahead). */
  async function makeSlot(
    counselorId: string,
    startMs: number,
    durationMin: number,
  ): Promise<string> {
    const startAt = new Date(startMs);
    const endAt = new Date(startMs + durationMin * 60 * 1000);
    const slot = await prisma.availabilitySlot.create({
      data: { counselorId, startAt, endAt, isOpen: true },
    });
    return slot.id;
  }

  function book(slotId: string) {
    return request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${seeded.customerToken}`)
      .send({ slotId, testResultId: seeded.testResultId });
  }

  // Each test uses a distinct day offset so islands never collide in time.
  const DAY = 24 * 60 * 60 * 1000;

  it('rejects a second booking at the SAME time on a different counselor (409)', async () => {
    const t = Date.now() + 10 * DAY;
    const slotA = await makeSlot(seeded.counselorId, t, 60);
    const slotB = await makeSlot(secondCounselorId, t, 60); // different counselor, same time

    const first = await book(slotA);
    expect(first.status).toBe(201);

    const second = await book(slotB);
    expect(second.status).toBe(409);
  });

  it('rejects a PARTIALLY overlapping booking with a different duration (409)', async () => {
    const t = Date.now() + 11 * DAY;
    // A: 10:00–11:00 (60min), B: 10:30–11:30 (60min) starting 30min in → overlaps.
    const slotA = await makeSlot(seeded.counselorId, t, 60);
    const slotB = await makeSlot(secondCounselorId, t + 30 * 60 * 1000, 60);

    const first = await book(slotA);
    expect(first.status).toBe(201);

    const second = await book(slotB);
    expect(second.status).toBe(409);
  });

  it('allows rebooking an overlapping time after CANCELLING the first (constraint is partial on active status)', async () => {
    const t = Date.now() + 12 * DAY;
    const slotA = await makeSlot(seeded.counselorId, t, 60);
    const slotB = await makeSlot(secondCounselorId, t, 60);

    const first = await book(slotA);
    expect(first.status).toBe(201);
    const firstId = (first.body as { id: string }).id;

    // Overlapping rebooking blocked while the first is ACTIVE.
    expect((await book(slotB)).status).toBe(409);

    // Cancel the first — it leaves the partial constraint.
    const cancel = await request(app.getHttpServer())
      .delete(`/bookings/${firstId}`)
      .set('Authorization', `Bearer ${seeded.customerToken}`);
    expect(cancel.status).toBe(200);

    // Now the overlapping time is free again.
    const rebook = await book(slotB);
    expect(rebook.status).toBe(201);
  });

  it('allows two back-to-back (non-overlapping) bookings — both succeed', async () => {
    const t = Date.now() + 13 * DAY;
    // A: 10:00–11:00, B: 11:00–12:00 — adjacent, half-open ranges do not overlap.
    const slotA = await makeSlot(seeded.counselorId, t, 60);
    const slotB = await makeSlot(secondCounselorId, t + 60 * 60 * 1000, 60);

    expect((await book(slotA)).status).toBe(201);
    expect((await book(slotB)).status).toBe(201);
  });

  it('serializes concurrent self-overlap creates: exactly 1 success, 1 × 409 (constraint enforces it past the pre-check)', async () => {
    const t = Date.now() + 14 * DAY;
    const slotA = await makeSlot(seeded.counselorId, t, 60);
    const slotB = await makeSlot(secondCounselorId, t, 60); // same time, different slot

    // Fire both simultaneously. Both pre-checks may pass (no committed row yet),
    // so the GiST EXCLUDE constraint is what guarantees exactly one survives.
    const [r1, r2] = await Promise.all([book(slotA), book(slotB)]);

    const created = [r1, r2].filter((r) => r.status === 201);
    const conflicts = [r1, r2].filter((r) => r.status === 409);
    const others = [r1, r2].filter((r) => r.status !== 201 && r.status !== 409);

    expect(created).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    expect(others).toHaveLength(0);

    // DB proof: exactly one ACTIVE booking spans that window for this customer.
    const activeCount = await prisma.booking.count({
      where: {
        customerId: seeded.customerId,
        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
        slotStartAt: { lt: new Date(t + 60 * 60 * 1000) },
        slotEndAt: { gt: new Date(t) },
      },
    });
    expect(activeCount).toBe(1);

    // eslint-disable-next-line no-console
    console.log(
      `[ADR0015] concurrent self-overlap: ${created.length}x201 / ${conflicts.length}x409 / db ACTIVE in-window=${activeCount}`,
    );
  });
});
