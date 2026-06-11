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
 * Aggregated calendar — counselor capacity per time window.
 *
 * The aggregated calendar collapses slots that share the same start/end window
 * across counselors into ONE bookable entry. A time stays available while ANY
 * counselor is free for it, and only disappears once EVERY counselor for that
 * window is booked.
 *
 * This is the "다른 고객이 그 시간대를 예약해서 가능한 상담사가 없으면 예약 불가" requirement:
 * with two counselors sharing 11:00, the time is bookable twice, then vanishes.
 */
interface CalendarWindow {
  slotId: string;
  counselorId: string;
  startAt: string;
  endAt: string;
  availableCount: number;
}
interface CalendarDayResponse {
  date: string;
  slots: CalendarWindow[];
}

describe('Aggregated calendar — per-window counselor capacity', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  // Two independent islands → two distinct counselors + customers.
  let islandA: SeededData;
  let islandB: SeededData;

  // A shared 11:00–12:00 window in business hours, on a day PAST the seed grid
  // end (seed runs 2026-06-01 – 2026-09-01 for 2 counselors). 2026-10-05 is a
  // Monday inside business hours with zero seed slots, so availableCount only
  // reflects the two test-island counselors created below.
  const start = new Date(2026, 9, 5, 11, 0, 0, 0); // 2026-10-05 Mon 11:00
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const dateKey = `${start.getFullYear()}-${`${start.getMonth() + 1}`.padStart(2, '0')}-${`${start.getDate()}`.padStart(2, '0')}`;

  let slotAId: string;
  let slotBId: string;

  beforeAll(async () => {
    const ctx = await bootTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    islandA = await seedIsolated(prisma, ctx.signToken, { slotCount: 1 });
    islandB = await seedIsolated(prisma, ctx.signToken, { slotCount: 1 });

    // Two counselors, SAME window. Both are open and unbooked to start.
    const slotA = await prisma.availabilitySlot.create({
      data: {
        counselorId: islandA.counselorId,
        startAt: start,
        endAt: end,
        isOpen: true,
      },
    });
    const slotB = await prisma.availabilitySlot.create({
      data: {
        counselorId: islandB.counselorId,
        startAt: start,
        endAt: end,
        isOpen: true,
      },
    });
    slotAId = slotA.id;
    slotBId = slotB.id;
  });

  afterAll(async () => {
    await cleanupSeeded(prisma, islandA);
    await cleanupSeeded(prisma, islandB);
    await app.close();
  });

  /** Fetches the single aggregated entry for our shared 11:00 window, if present. */
  async function fetchWindow(token: string): Promise<CalendarWindow | undefined> {
    const res = await request(app.getHttpServer())
      .get('/counselors/availability-calendar')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const day = (res.body as CalendarDayResponse[]).find((d) => d.date === dateKey);
    return day?.slots.find(
      (s) => s.slotId === slotAId || s.slotId === slotBId,
    );
  }

  it('collapses two counselors at the same time into one entry with availableCount 2', async () => {
    const window = await fetchWindow(islandA.customerToken);
    expect(window).toBeDefined();
    // ONE bookable entry for the shared window, not one-per-counselor.
    expect([slotAId, slotBId]).toContain(window!.slotId);
    expect(window!.availableCount).toBe(2);
  });

  it('keeps the time available (availableCount 1) after the first counselor is booked', async () => {
    const before = await fetchWindow(islandA.customerToken);
    const firstSlotId = before!.slotId;

    // First customer books the representative slot.
    const booking = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${islandA.customerToken}`)
      .send({ slotId: firstSlotId, testResultId: islandA.testResultId });
    expect(booking.status).toBe(201);
    expect(booking.body.status).toBe(BookingStatus.PENDING);

    // The window is still bookable — the OTHER counselor remains free.
    const after = await fetchWindow(islandA.customerToken);
    expect(after).toBeDefined();
    expect(after!.availableCount).toBe(1);
    expect(after!.slotId).not.toBe(firstSlotId);
  });

  it('removes the time entirely once the last remaining counselor is booked', async () => {
    const before = await fetchWindow(islandB.customerToken);
    const lastSlotId = before!.slotId;

    // A different customer books the last free counselor for that window.
    const booking = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${islandB.customerToken}`)
      .send({ slotId: lastSlotId, testResultId: islandB.testResultId });
    expect(booking.status).toBe(201);

    // No counselor left → the time disappears from availability.
    const after = await fetchWindow(islandB.customerToken);
    expect(after).toBeUndefined();
  });
});
