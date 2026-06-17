import { INestApplication } from '@nestjs/common';
import {
  BookingStatus,
  QaFeedback,
  QaMessageRole,
  QaMessageSource,
  SubjectType,
} from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  bootTestApp,
  cleanupSeeded,
  seedIsolated,
  SeededData,
} from './helpers/test-app';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Q&A deflection analytics (AC10). Subject-attributed behavioral deflection with
 * the 7-day window AND immature-window exclusion. The test DB is pristine
 * (globalSetup resets it, no demo seed), so the GLOBAL qaDeflection block
 * reflects exactly the rows this spec creates.
 *
 * Constructed (subject = the seeded customer):
 *   S_deflected : created 20d ago, NO booking in window         → mature, deflected
 *   S_day6      : created 20d ago, booking at +6d (in window)   → mature, converted
 *   S_day8      : created 20d ago, booking at +8d (out window)  → mature, deflected
 *   S_immature  : created  2d ago                               → excluded (immature)
 * ⇒ matureCount = 3, deflected = 2  → behavioralDeflectionRate = 2/3
 * Helpfulness: one ASSISTANT YES + one ASSISTANT NO            → 1/2 = 0.5
 * sessionCount = 4
 */
describe('Q&A deflection analytics (AC10)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seeded: SeededData;
  let adminToken: string;
  // qaDeflection.sessionCount is a GLOBAL count (no WHERE). The suite runs with
  // maxWorkers:1 + a globalSetup DB reset, so siblings clean up before this spec
  // runs — but we still assert a DELTA (baseline + 4) rather than an absolute, so
  // the count assertion stays correct even if isolation weakens. (The rate
  // assertions below remain global aggregates and rely on the serial isolation.)
  let baselineSessionCount = 0;

  beforeAll(async () => {
    const ctx = await bootTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    seeded = await seedIsolated(prisma, ctx.signToken, { slotCount: 2 });
    adminToken = ctx.signToken({ sub: `${seeded.unique}-admin`, role: 'ADMIN' });

    baselineSessionCount = await prisma.qaSession.count();

    const now = Date.now();

    // Each session uses a DISTINCT subject so a booking attributes to exactly
    // one session's window (real deflection is per-subject, not per-customer).
    const makeSession = (
      subjectId: string,
      ageDays: number,
      feedback?: QaFeedback,
    ) =>
      prisma.qaSession.create({
        data: {
          customerId: seeded.customerId,
          subjectType: SubjectType.CUSTOMER,
          subjectId,
          testResultId: seeded.testResultId,
          createdAt: new Date(now - ageDays * DAY),
          messages: {
            create: [
              { role: QaMessageRole.USER, text: 'q', inScope: true },
              {
                role: QaMessageRole.ASSISTANT,
                text: 'a',
                source: QaMessageSource.LLM,
                ...(feedback ? { feedback } : {}),
              },
            ],
          },
        },
      });

    const makeBooking = (subjectId: string, slotId: string, createdAt: Date) =>
      prisma.booking.create({
        data: {
          slotId,
          customerId: seeded.customerId,
          subjectType: SubjectType.CUSTOMER,
          subjectId,
          status: BookingStatus.COMPLETED,
          slotStartAt: new Date(now - 5 * DAY),
          slotEndAt: new Date(now - 5 * DAY + 60 * 60 * 1000),
          createdAt,
        },
      });

    const tag = seeded.unique;
    const sDeflected = `${tag}-deflected`;
    const sDay6 = `${tag}-day6`;
    const sDay8 = `${tag}-day8`;
    const sImmature = `${tag}-immature`;

    // Two of the mature sessions also carry explicit feedback (1 YES, 1 NO).
    await makeSession(sDeflected, 20, QaFeedback.YES); // no booking → deflected
    const day6Session = await makeSession(sDay6, 20, QaFeedback.NO);
    const day8Session = await makeSession(sDay8, 20);
    await makeSession(sImmature, 2); // immature → excluded

    // Booking 6 days after its session → inside the window (converted).
    await makeBooking(
      sDay6,
      seeded.slotIds[0],
      new Date(day6Session.createdAt.getTime() + 6 * DAY),
    );
    // Booking 8 days after its session → outside the window (still deflected).
    await makeBooking(
      sDay8,
      seeded.slotIds[1],
      new Date(day8Session.createdAt.getTime() + 8 * DAY),
    );
  });

  afterAll(async () => {
    await prisma.qaSession.deleteMany({ where: { customerId: seeded.customerId } });
    await cleanupSeeded(prisma, seeded);
    await app.close();
  });

  it('reports subject-attributed deflection with immature exclusion + window edges', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/analytics')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const qa = res.body.qaDeflection;
    expect(qa.sessionCount).toBe(baselineSessionCount + 4);
    // 2 deflected / 3 mature (immature session excluded from the denominator).
    expect(qa.behavioralDeflectionRate).toBeCloseTo(2 / 3, 5);
    // 1 YES of 2 rated answers.
    expect(qa.helpfulnessRate).toBeCloseTo(0.5, 5);
  });
});
