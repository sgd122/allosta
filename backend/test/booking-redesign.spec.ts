import { INestApplication } from '@nestjs/common';
import { BookingStatus, SubjectType } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  bootTestApp,
  cleanupSeeded,
  seedIsolated,
  SeededData,
} from './helpers/test-app';

/**
 * Booking redesign (AC9–AC14): the PENDING-first, test-result-driven flow.
 *
 * Covers the contract introduced by the redesign:
 *  - POST /bookings derives the subject from the referenced TestResult and
 *    re-checks ownership server-side (403 when the caller does not own it).
 *  - New bookings are created PENDING.
 *  - GET /bookings returns only the caller's own bookings, with a status field.
 *  - PATCH /bookings/:id/confirm transitions PENDING -> CONFIRMED (counselor),
 *    is idempotency-guarded (409 on re-confirm), and ownership-guarded (403 for
 *    a non-owning counselor).
 *  - GET /counselors/availability-calendar aggregates open slots by date and
 *    excludes a slot once it has an active (PENDING) booking.
 */
describe('Booking redesign (PENDING-first, test-result-driven) — AC9–AC14', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  // islandA owns the slot/customer under test; islandB is a foreign island.
  let islandA: SeededData;
  let islandB: SeededData;

  beforeAll(async () => {
    const ctx = await bootTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    // islandA gets several slots so independent it() blocks never collide.
    islandA = await seedIsolated(prisma, ctx.signToken, { slotCount: 4 });
    islandB = await seedIsolated(prisma, ctx.signToken, { slotCount: 1 });
  });

  afterAll(async () => {
    await cleanupSeeded(prisma, islandA);
    await cleanupSeeded(prisma, islandB);
    await app.close();
  });

  describe('POST /bookings — ownership + subject derivation', () => {
    it('returns 403 when booking a test result the customer does not own', async () => {
      // islandA's customer attempts to book using islandB's TestResult. The
      // subject (islandB's customer) is derived server-side, so the ownership
      // re-check rejects islandA.
      const res = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${islandA.customerToken}`)
        .send({
          slotId: islandA.slotIds[0],
          testResultId: islandB.testResultId,
        });

      expect(res.status).toBe(403);
    });

    it('derives the subject from the test result and creates a PENDING booking', async () => {
      const res = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${islandA.customerToken}`)
        .send({
          slotId: islandA.slotIds[1],
          testResultId: islandA.testResultId,
        });

      expect(res.status).toBe(201);
      // Subject is derived from the seeded CUSTOMER-owned TestResult.
      expect(res.body.subjectType).toBe(SubjectType.CUSTOMER);
      expect(res.body.subjectId).toBe(islandA.customerId);
      expect(res.body.testResultId).toBe(islandA.testResultId);
      // New bookings start PENDING.
      expect(res.body.status).toBe(BookingStatus.PENDING);
    });
  });

  describe('GET /bookings — caller-scoped own bookings', () => {
    it('returns only the caller\'s own bookings, each with a status field', async () => {
      const booking = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${islandA.customerToken}`)
        .send({
          slotId: islandA.slotIds[2],
          testResultId: islandA.testResultId,
        });
      expect(booking.status).toBe(201);
      const bookingId = booking.body.id as string;

      const res = await request(app.getHttpServer())
        .get('/bookings')
        .set('Authorization', `Bearer ${islandA.customerToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      const ids = (res.body as { id: string }[]).map((b) => b.id);
      expect(ids).toContain(bookingId);

      // Every returned row exposes a status (예약상태) field.
      for (const entry of res.body as { status: BookingStatus }[]) {
        expect(entry.status).toBeDefined();
      }

      // Scope: islandB's customer must not see islandA's booking.
      const otherRes = await request(app.getHttpServer())
        .get('/bookings')
        .set('Authorization', `Bearer ${islandB.customerToken}`);
      expect(otherRes.status).toBe(200);
      const otherIds = (otherRes.body as { id: string }[]).map((b) => b.id);
      expect(otherIds).not.toContain(bookingId);
    });
  });

  describe('PATCH /bookings/:id/confirm — counselor confirmation', () => {
    it('confirms PENDING -> CONFIRMED, rejects re-confirm with 409, and a foreign counselor with 403', async () => {
      // Customer books a fresh slot (PENDING).
      const booking = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${islandA.customerToken}`)
        .send({
          slotId: islandA.slotIds[3],
          testResultId: islandA.testResultId,
        });
      expect(booking.status).toBe(201);
      const bookingId = booking.body.id as string;

      // A non-owning counselor (islandB) cannot confirm islandA's booking.
      const foreign = await request(app.getHttpServer())
        .patch(`/bookings/${bookingId}/confirm`)
        .set('Authorization', `Bearer ${islandB.counselorToken}`);
      expect(foreign.status).toBe(403);

      // The owning counselor confirms PENDING -> CONFIRMED.
      const confirm = await request(app.getHttpServer())
        .patch(`/bookings/${bookingId}/confirm`)
        .set('Authorization', `Bearer ${islandA.counselorToken}`);
      expect(confirm.status).toBe(200);
      expect(confirm.body.status).toBe(BookingStatus.CONFIRMED);

      // Confirming an already-CONFIRMED booking is a 409 (not pending).
      const again = await request(app.getHttpServer())
        .patch(`/bookings/${bookingId}/confirm`)
        .set('Authorization', `Bearer ${islandA.counselorToken}`);
      expect(again.status).toBe(409);
    });
  });

  describe('GET /counselors/availability-calendar — aggregated open slots', () => {
    it('returns days with real slotIds and excludes a slot once it has an active booking', async () => {
      // Create a dedicated future slot at a controlled business-hour (10:00
      // local) so it passes the [9, 18) business-hours filter regardless of the
      // current clock. Reuse islandA's counselor + customer test result.
      const start = new Date();
      start.setDate(start.getDate() + 5);
      start.setHours(10, 0, 0, 0);
      const end = new Date(start.getTime() + 60 * 60 * 1000);

      const slot = await prisma.availabilitySlot.create({
        data: {
          counselorId: islandA.counselorId,
          startAt: start,
          endAt: end,
          isOpen: true,
        },
      });

      const dateKey = `${start.getFullYear()}-${`${start.getMonth() + 1}`.padStart(2, '0')}-${`${start.getDate()}`.padStart(2, '0')}`;

      // Before booking: the slot appears under its calendar day with its real id.
      const before = await request(app.getHttpServer())
        .get('/counselors/availability-calendar')
        .set('Authorization', `Bearer ${islandA.customerToken}`);
      expect(before.status).toBe(200);

      const dayBefore = (
        before.body as { date: string; slots: { slotId: string }[] }[]
      ).find((d) => d.date === dateKey);
      expect(dayBefore).toBeDefined();
      expect(dayBefore!.slots.map((s) => s.slotId)).toContain(slot.id);

      // Book the slot (PENDING) — an active booking hides it from availability.
      const booking = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${islandA.customerToken}`)
        .send({
          slotId: slot.id,
          testResultId: islandA.testResultId,
        });
      expect(booking.status).toBe(201);
      expect(booking.body.status).toBe(BookingStatus.PENDING);

      // After booking: the slot is excluded from the aggregated calendar.
      const after = await request(app.getHttpServer())
        .get('/counselors/availability-calendar')
        .set('Authorization', `Bearer ${islandA.customerToken}`);
      expect(after.status).toBe(200);

      const dayAfter = (
        after.body as { date: string; slots: { slotId: string }[] }[]
      ).find((d) => d.date === dateKey);
      const slotIdsAfter = dayAfter
        ? dayAfter.slots.map((s) => s.slotId)
        : [];
      expect(slotIdsAfter).not.toContain(slot.id);
    });
  });
});
