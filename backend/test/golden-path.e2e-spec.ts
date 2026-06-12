import { INestApplication } from '@nestjs/common';
import {
  AiSummaryStatus,
  BookingStatus,
  NotificationType,
  Outcome,
  SubjectType,
  WaitlistStatus,
} from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  bootTestApp,
  cleanupSeeded,
  seedIsolated,
  SeededData,
} from './helpers/test-app';

/**
 * Golden path (AC1/AC4/AC6/AC9) plus AC10 waitlist promotion.
 *
 * One end-to-end flow over HTTP (supertest, no browser):
 *   list slots -> book -> slot disappears -> counselor sees it ->
 *   counselor records (PURCHASED + product + metric) -> admin analytics
 *   reflects the conversion/product/metric. Then a waitlist + cancellation
 *   proves FIFO promotion + SLOT_OPENED notification.
 */
describe('Golden path (AC1/AC4/AC6/AC9) + AC10 waitlist', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seeded: SeededData;
  let adminToken: string;

  beforeAll(async () => {
    const ctx = await bootTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    // Two slots: one for the golden path, one to free up via cancellation.
    seeded = await seedIsolated(prisma, ctx.signToken, { slotCount: 2 });
    // An admin token can be minted directly — analytics needs no profile id.
    adminToken = ctx.signToken({
      sub: `${seeded.unique}-admin-user`,
      role: 'ADMIN',
    });
  });

  afterAll(async () => {
    await cleanupSeeded(prisma, seeded);
    await app.close();
  });

  it('runs booking -> schedule -> record -> analytics, with the slot leaving availability', async () => {
    const counselorId = seeded.counselorId;
    const targetSlotId = seeded.slotIds[0];

    // AC1: the seeded open slot is listed.
    const slotsBefore = await request(app.getHttpServer())
      .get(`/counselors/${counselorId}/slots`)
      .set('Authorization', `Bearer ${seeded.customerToken}`);
    expect(slotsBefore.status).toBe(200);
    expect(slotsBefore.body.map((s: { id: string }) => s.id)).toContain(
      targetSlotId,
    );

    // AC1/AC-P3: customer books the slot with an optional pre-question (concern)
    // — new bookings start PENDING and the concern is stored for the brief.
    const booking = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${seeded.customerToken}`)
      .send({
        slotId: targetSlotId,
        testResultId: seeded.testResultId,
        concern: '집중력 개선이 가능한지 궁금합니다',
      });
    expect(booking.status).toBe(201);
    expect(booking.body.status).toBe('PENDING');
    const bookingId = booking.body.id as string;

    // AC1: the booked slot is no longer derived-available (PENDING hides it).
    const slotsAfter = await request(app.getHttpServer())
      .get(`/counselors/${counselorId}/slots`)
      .set('Authorization', `Bearer ${seeded.customerToken}`);
    expect(slotsAfter.status).toBe(200);
    expect(slotsAfter.body.map((s: { id: string }) => s.id)).not.toContain(
      targetSlotId,
    );

    // AC4: counselor sees the PENDING booking on their schedule (status field).
    const schedule = await request(app.getHttpServer())
      .get('/counselor/schedule')
      .set('Authorization', `Bearer ${seeded.counselorToken}`);
    expect(schedule.status).toBe(200);
    const scheduleEntry = schedule.body.find(
      (e: { bookingId: string }) => e.bookingId === bookingId,
    );
    expect(scheduleEntry).toBeDefined();
    expect(scheduleEntry.hasRecord).toBe(false);
    expect(scheduleEntry.status).toBe('PENDING');

    // AC-P3: counselor opens the pre-consultation brief BEFORE recording. The
    // brief is deterministic (read-only projection) and surfaces the customer's
    // concern; opening it marks briefOpenedAt for the brief-open-rate metric.
    const brief = await request(app.getHttpServer())
      .get(`/counselor/bookings/${bookingId}/brief`)
      .set('Authorization', `Bearer ${seeded.counselorToken}`);
    expect(brief.status).toBe(200);
    expect(brief.body.bookingId).toBe(bookingId);
    expect(brief.body.concern).toBe('집중력 개선이 가능한지 궁금합니다');
    // The seeded TestResult metric is surfaced as a brief indicator.
    expect(
      brief.body.indicators.map((i: { metricKey: string }) => i.metricKey),
    ).toContain(seeded.testResultMetricKey);

    // AC-P7 marker: opening the brief stamped briefOpenedAt on the booking.
    const opened = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { briefOpenedAt: true },
    });
    expect(opened?.briefOpenedAt).not.toBeNull();

    // AC12: counselor confirms the pending booking -> CONFIRMED.
    const confirm = await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${seeded.counselorToken}`);
    expect(confirm.status).toBe(200);
    expect(confirm.body.status).toBe('CONFIRMED');

    // AC4/AC9: counselor records the consultation with PURCHASED outcome,
    // one interested product, and one metric ref to the seeded TestResult.
    const productId = seeded.productIds[0];
    const record = await request(app.getHttpServer())
      .post('/consultation-records')
      .set('Authorization', `Bearer ${seeded.counselorToken}`)
      .send({
        bookingId,
        summary: 'golden path consultation',
        recommendation: '권고 사항',
        actions: [],
        outcome: Outcome.PURCHASED,
        interestedProductIds: [productId],
        metricRefs: [
          {
            testResultId: seeded.testResultId,
            metricKey: seeded.testResultMetricKey,
          },
        ],
        // AC4/AC5: enroll the customer into the island-local challenge so the
        // dashboard's challenge metrics light up downstream.
        challengeId: seeded.challengeId,
      });
    expect(record.status).toBe(201);
    expect(record.body.outcome).toBe(Outcome.PURCHASED);
    expect(record.body.products).toHaveLength(1);
    expect(record.body.metrics).toHaveLength(1);

    // AC-P4/AC-P6: a deterministic FALLBACK summary is persisted IMMEDIATELY on
    // the createRecord response path (synchronous template, no Ollama). Exactly
    // one row, status FALLBACK, and NO UPGRADED row before any sweep runs.
    const summaries = await prisma.consultationAiSummary.findMany({
      where: { record: { bookingId } },
    });
    expect(summaries).toHaveLength(1);
    expect(summaries[0].status).toBe(AiSummaryStatus.FALLBACK);
    expect(summaries[0].model).toBeNull();
    expect(summaries[0].content.length).toBeGreaterThan(0);

    // AC13: recording transitions the booking to COMPLETED.
    const completed = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { status: true },
    });
    expect(completed?.status).toBe(BookingStatus.COMPLETED);

    // AC6/AC9: admin analytics reflects this PURCHASED record.
    const analytics = await request(app.getHttpServer())
      .get('/admin/analytics')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(analytics.status).toBe(200);

    expect(analytics.body.totalRecords).toBeGreaterThanOrEqual(1);
    // A PURCHASED record exists, so conversionRate is positive.
    expect(analytics.body.conversionRate).toBeGreaterThan(0);
    expect(analytics.body.outcomeDistribution.PURCHASED).toBeGreaterThanOrEqual(
      1,
    );

    // productInterest contains the seeded product.
    const productEntry = analytics.body.productInterest.find(
      (p: { productId: string }) => p.productId === productId,
    );
    expect(productEntry).toBeDefined();
    expect(productEntry.count).toBeGreaterThanOrEqual(1);

    // metricConversion contains the discussed metric key, fully converted.
    const metricEntry = analytics.body.metricConversion.find(
      (m: { metricKey: string }) =>
        m.metricKey === seeded.testResultMetricKey,
    );
    expect(metricEntry).toBeDefined();
    expect(metricEntry.purchasedCount).toBeGreaterThanOrEqual(1);

    // AC4/AC5: the PURCHASED record enrolled the customer into a challenge, so
    // the dashboard's challenge metrics must reflect it. The admin view is
    // global (scope=all): at least this island's one enrollment is present, and
    // a PURCHASED record exists so the conversion rate is a number, never null.
    expect(analytics.body.challengeEnrollments).toBeGreaterThanOrEqual(1);
    expect(analytics.body.challengeConversionRate).not.toBeNull();
    expect(typeof analytics.body.challengeConversionRate).toBe('number');

    // AC-P7: the productivity headline (brief-open-rate) and the AI-summary aux
    // metrics are exposed on the dashboard. This island opened one brief and the
    // booking is now COMPLETED (in the denominator), so the rate is positive and
    // at least one FALLBACK summary is counted.
    expect(typeof analytics.body.briefOpenRate).toBe('number');
    expect(analytics.body.briefOpenRate).toBeGreaterThan(0);
    expect(analytics.body.aiSummaryCount).toBeGreaterThanOrEqual(1);
    expect(typeof analytics.body.aiSummaryUpgradedRatio).toBe('number');
  });

  it('promotes a waiting customer to NOTIFIED and emits SLOT_OPENED when a booking is cancelled (AC10)', async () => {
    const counselorId = seeded.counselorId;
    const slotToCancel = seeded.slotIds[1];

    // Customer books the second slot (will be cancelled to free a slot).
    const booking = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${seeded.customerToken}`)
      .send({
        slotId: slotToCancel,
        testResultId: seeded.testResultId,
      });
    expect(booking.status).toBe(201);
    const bookingId = booking.body.id as string;

    // Customer joins the counselor's waitlist (AC10 register).
    const waitlist = await request(app.getHttpServer())
      .post('/waitlist')
      .set('Authorization', `Bearer ${seeded.customerToken}`)
      .send({
        counselorId,
        subjectType: SubjectType.CUSTOMER,
        subjectId: seeded.customerId,
      });
    expect(waitlist.status).toBe(201);
    expect(waitlist.body.status).toBe(WaitlistStatus.WAITING);
    const waitlistId = waitlist.body.id as string;

    // Cancel the confirmed booking -> FIFO promotion fires.
    const cancel = await request(app.getHttpServer())
      .delete(`/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${seeded.customerToken}`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe('CANCELLED');

    // The waiting entry flipped to NOTIFIED.
    const promoted = await prisma.waitlist.findUnique({
      where: { id: waitlistId },
      select: { status: true },
    });
    expect(promoted?.status).toBe(WaitlistStatus.NOTIFIED);

    // A SLOT_OPENED notification row exists for that waitlist entry.
    const slotOpened = await prisma.notification.findFirst({
      where: { waitlistId, type: NotificationType.SLOT_OPENED },
    });
    expect(slotOpened).not.toBeNull();
  });
});
