import { INestApplication } from '@nestjs/common';
import { NotificationChannel, NotificationType } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  bootTestApp,
  cleanupSeeded,
  seedIsolated,
  SeededData,
} from './helpers/test-app';

/**
 * Notification read/dismiss — PATCH /notifications/:id/read
 *
 * Ownership is derived via the notification's booking (booking.customerId).
 * A customer can only mark their own notifications read; a foreign customer
 * attempting the same is rejected with 403.
 */
describe('Notification read/dismiss (PATCH /notifications/:id/read)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Island A — owns the booking + notifications under test.
  let islandA: SeededData;
  // Island B — a foreign customer used for the 403 check.
  let islandB: SeededData;

  beforeAll(async () => {
    const ctx = await bootTestApp();
    app = ctx.app;
    prisma = ctx.prisma;

    islandA = await seedIsolated(prisma, ctx.signToken, { slotCount: 1 });
    islandB = await seedIsolated(prisma, ctx.signToken, { slotCount: 1 });
  });

  afterAll(async () => {
    await cleanupSeeded(prisma, islandA);
    await cleanupSeeded(prisma, islandB);
    await app.close();
  });

  /**
   * Helper: create a booking for islandA then return the first notification
   * tied to it. POST /bookings produces CONFIRMATION + REMINDER notifications.
   */
  async function createBookingAndGetNotificationId(): Promise<string> {
    const bookingRes = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${islandA.customerToken}`)
      .send({ slotId: islandA.slotIds[0], testResultId: islandA.testResultId });

    expect(bookingRes.status).toBe(201);

    const notifRes = await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', `Bearer ${islandA.customerToken}`);

    expect(notifRes.status).toBe(200);
    expect((notifRes.body as unknown[]).length).toBeGreaterThan(0);

    // Return the first notification id (most recent, ordered desc by createdAt).
    const [first] = notifRes.body as Array<{ id: string }>;
    return first.id;
  }

  it('customer marks their own notification read → 200 and readAt is set', async () => {
    const notificationId = await createBookingAndGetNotificationId();

    const res = await request(app.getHttpServer())
      .patch(`/notifications/${notificationId}/read`)
      .set('Authorization', `Bearer ${islandA.customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(notificationId);
    expect(res.body.readAt).toBeTruthy();
    expect(new Date(res.body.readAt as string).getTime()).toBeGreaterThan(0);
  });

  it('re-marking an already-read notification is idempotent → 200, readAt unchanged', async () => {
    // Get the notification we just read (first in the list, already read above).
    const notifRes = await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', `Bearer ${islandA.customerToken}`);

    const notifications = notifRes.body as Array<{ id: string; readAt: string | null }>;
    const alreadyRead = notifications.find((n) => n.readAt !== null);
    expect(alreadyRead).toBeDefined();
    const originalReadAt = alreadyRead!.readAt;

    // PATCH again — readAt must not change.
    const res = await request(app.getHttpServer())
      .patch(`/notifications/${alreadyRead!.id}/read`)
      .set('Authorization', `Bearer ${islandA.customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.readAt).toBe(originalReadAt);
  });

  it('foreign customer marking another customer notification → 403', async () => {
    // islandB creates its own booking to get a notification id.
    const bookingRes = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${islandB.customerToken}`)
      .send({ slotId: islandB.slotIds[0], testResultId: islandB.testResultId });

    expect(bookingRes.status).toBe(201);

    // Get islandB's notification.
    const notifRes = await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', `Bearer ${islandB.customerToken}`);

    expect(notifRes.status).toBe(200);
    const [targetNotif] = notifRes.body as Array<{ id: string }>;

    // islandA's customer tries to mark islandB's notification → 403.
    const res = await request(app.getHttpServer())
      .patch(`/notifications/${targetNotif.id}/read`)
      .set('Authorization', `Bearer ${islandA.customerToken}`);

    expect(res.status).toBe(403);
  });
});
