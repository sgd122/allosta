import { INestApplication } from '@nestjs/common';
import { AiSummaryStatus, BookingStatus, SubjectType } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  bootTestApp,
  cleanupSeeded,
  seedIsolated,
  SeededData,
} from './helpers/test-app';

/**
 * Brief open-rate + AI-summary aux metrics analytics (AC-P7).
 *
 * Denominator = bookings with status IN (CONFIRMED, COMPLETED, NO_SHOW);
 * numerator = those with briefOpenedAt != null. Deterministic aggregate, scoped
 * own/all like the rest of the dashboard.
 *
 * Island A (counselorA):
 *   - bA1 CONFIRMED, briefOpenedAt set        (counts num + denom)
 *   - bA2 COMPLETED, briefOpenedAt set        (counts num + denom)
 *   - bA3 NO_SHOW,   briefOpenedAt null       (counts denom only)
 *   - bA4 PENDING,   briefOpenedAt set        (excluded from denom entirely)
 *   - bA5 CANCELLED, briefOpenedAt set        (excluded from denom entirely)
 *   Expected briefOpenRate = 2 / 3.
 *   - 2 ConsultationAiSummary rows: 1 FALLBACK + 1 UPGRADED → upgradedRatio 0.5
 *
 * Island B (counselorB):
 *   - bB1 CONFIRMED, briefOpenedAt null       (denom only)
 *   Expected briefOpenRate = 0; aiSummaryCount = 0.
 */
describe('Analytics brief-open-rate + AI summary aux (AC-P7)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let islandA: SeededData;
  let islandB: SeededData;

  beforeAll(async () => {
    const ctx = await bootTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    islandA = await seedIsolated(prisma, ctx.signToken, { slotCount: 5 });
    islandB = await seedIsolated(prisma, ctx.signToken, { slotCount: 1 });

    const opened = new Date();

    // ── Island A bookings ────────────────────────────────────────────────
    const mk = async (
      island: SeededData,
      slotId: string,
      status: BookingStatus,
      briefOpenedAt: Date | null,
    ): Promise<string> => {
      const b = await prisma.booking.create({
        data: {
          slotId,
          customerId: island.customerId,
          subjectType: SubjectType.CUSTOMER,
          subjectId: island.customerId,
          status,
          briefOpenedAt,
        },
      });
      return b.id;
    };

    await mk(islandA, islandA.slotIds[0], BookingStatus.CONFIRMED, opened); // num+denom
    const bA2 = await mk(
      islandA,
      islandA.slotIds[1],
      BookingStatus.COMPLETED,
      opened,
    ); // num+denom
    await mk(islandA, islandA.slotIds[2], BookingStatus.NO_SHOW, null); // denom only
    await mk(islandA, islandA.slotIds[3], BookingStatus.PENDING, opened); // excluded
    await mk(islandA, islandA.slotIds[4], BookingStatus.CANCELLED, opened); // excluded

    // Two AI-summary rows for island A (1 FALLBACK + 1 UPGRADED). They attach to
    // ConsultationRecords on island-A bookings so scope=own resolves them.
    const recA2 = await prisma.consultationRecord.create({
      data: {
        bookingId: bA2,
        counselorId: islandA.counselorId,
        summary: 's',
        recommendation: 'r',
        actions: [],
        outcome: 'EXPLAINED',
      },
    });
    await prisma.consultationAiSummary.create({
      data: {
        recordId: recA2.id,
        status: AiSummaryStatus.FALLBACK,
        model: null,
        content: 'fallback',
      },
    });

    // A second island-A booking+record carrying an UPGRADED summary.
    const slotA6 = await prisma.availabilitySlot.create({
      data: {
        counselorId: islandA.counselorId,
        startAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
        endAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000 + 3_600_000),
        isOpen: true,
      },
    });
    // CANCELLED so it stays OUT of the briefOpenRate denominator (which is IN
    // (CONFIRMED, COMPLETED, NO_SHOW)) while its record + UPGRADED summary still
    // count toward the AI-summary aux metrics (scoped by record→booking→slot).
    const bA6 = await mk(islandA, slotA6.id, BookingStatus.CANCELLED, null);
    const recA6 = await prisma.consultationRecord.create({
      data: {
        bookingId: bA6,
        counselorId: islandA.counselorId,
        summary: 's2',
        recommendation: 'r2',
        actions: [],
        outcome: 'PURCHASED',
      },
    });
    await prisma.consultationAiSummary.create({
      data: {
        recordId: recA6.id,
        status: AiSummaryStatus.UPGRADED,
        model: 'gemma3n:e4b',
        content: 'upgraded',
      },
    });

    // ── Island B: one CONFIRMED, brief never opened, no summaries ─────────
    await mk(islandB, islandB.slotIds[0], BookingStatus.CONFIRMED, null);
  });

  afterAll(async () => {
    await cleanupSeeded(prisma, islandA);
    await cleanupSeeded(prisma, islandB);
    await app.close();
  });

  it('briefOpenRate (scope=own) = 2/3 for counselorA — denom IN (CONFIRMED,COMPLETED,NO_SHOW)', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/analytics')
      .set('Authorization', `Bearer ${islandA.counselorToken}`);

    expect(res.status).toBe(200);
    // bA2 COMPLETED counts toward denom (was CONFIRMED→COMPLETED equivalent),
    // bA1 CONFIRMED + bA3 NO_SHOW also in denom; PENDING + CANCELLED excluded.
    // Numerator = bA1 + bA2 opened = 2. Denominator = bA1 + bA2 + bA3 = 3.
    expect((res.body as { briefOpenRate: number }).briefOpenRate).toBeCloseTo(
      2 / 3,
    );
  });

  it('aiSummary aux metrics (scope=own) for counselorA — count 2, upgradedRatio 0.5', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/analytics')
      .set('Authorization', `Bearer ${islandA.counselorToken}`);

    expect(res.status).toBe(200);
    const body = res.body as {
      aiSummaryCount: number;
      aiSummaryUpgradedRatio: number;
    };
    expect(body.aiSummaryCount).toBe(2);
    expect(body.aiSummaryUpgradedRatio).toBeCloseTo(0.5);
  });

  it('scope isolation: counselorB sees briefOpenRate 0 and zero AI summaries', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/analytics')
      .set('Authorization', `Bearer ${islandB.counselorToken}`);

    expect(res.status).toBe(200);
    const body = res.body as {
      briefOpenRate: number;
      aiSummaryCount: number;
      aiSummaryUpgradedRatio: number;
    };
    // 0 opened / 1 (CONFIRMED) denominator = 0; A's data must not bleed in.
    expect(body.briefOpenRate).toBe(0);
    expect(body.aiSummaryCount).toBe(0);
    expect(body.aiSummaryUpgradedRatio).toBe(0);
  });

  it('rate fields are finite numbers (zero-denominator guard)', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/analytics')
      .set('Authorization', `Bearer ${islandB.counselorToken}`);

    expect(res.status).toBe(200);
    const body = res.body as {
      briefOpenRate: unknown;
      aiSummaryUpgradedRatio: unknown;
    };
    expect(typeof body.briefOpenRate).toBe('number');
    expect(Number.isFinite(body.briefOpenRate as number)).toBe(true);
    expect(Number.isFinite(body.aiSummaryUpgradedRatio as number)).toBe(true);
  });
});
