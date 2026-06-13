import { Injectable } from '@nestjs/common';
import { BookingStatus, CallOutcome, Outcome, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AnalyticsDashboard,
  AnalyticsDrilldownItem,
  AnalyticsRecordRow,
  AnalyticsRecordsList,
  BookingFunnel,
  CallOutcomeDistribution,
  MetricConversionItem,
  OutcomeDistribution,
  ProductInterestItem,
} from './analytics.interfaces';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(counselorId?: string): Promise<AnalyticsDashboard> {
    const [
      totalRecords,
      outcomeGroups,
      productGroups,
      metricConversion,
      funnel,
      slotUtilization,
      challengeEnrollments,
      challengeConversionRate,
      briefOpenRate,
      contactAttempts,
      callOutcomeGroups,
      noShowWithoutContactRate,
    ] = await Promise.all([
      this.countTotalRecords(counselorId),
      this.groupByOutcome(counselorId),
      this.groupByProduct(counselorId),
      this.aggregateMetricConversion(counselorId),
      this.groupBookingFunnel(counselorId),
      this.computeSlotUtilization(counselorId),
      this.countChallengeEnrollments(counselorId),
      this.computeChallengeConversion(counselorId),
      this.computeBriefOpenRate(counselorId),
      this.countContactAttempts(counselorId),
      this.groupByCallOutcome(counselorId),
      this.computeNoShowWithoutContactRate(counselorId),
    ]);

    const outcomeDistribution = this.buildOutcomeDistribution(outcomeGroups);
    const callOutcomeDistribution =
      this.buildCallOutcomeDistribution(callOutcomeGroups);
    const purchasedCount = outcomeDistribution.PURCHASED;
    const conversionRate =
      totalRecords > 0 ? purchasedCount / totalRecords : 0;

    const noShowDenominator = funnel.completed + funnel.noShow;
    const noShowRate =
      noShowDenominator > 0 ? funnel.noShow / noShowDenominator : 0;

    return {
      totalRecords,
      conversionRate,
      outcomeDistribution,
      productInterest: productGroups,
      metricConversion,
      funnel,
      noShowRate,
      slotUtilization,
      challengeEnrollments,
      challengeConversionRate,
      briefOpenRate,
      contactAttempts,
      callOutcomeDistribution,
      noShowWithoutContactRate,
    };
  }

  async getDrilldown(recordId: string): Promise<AnalyticsDrilldownItem> {
    const record = await this.prisma.consultationRecord.findUniqueOrThrow({
      where: { id: recordId },
      include: {
        booking: {
          include: {
            slot: true,
            // PII narrowing (ADR 0016): only the display name is needed here.
            // Selecting the full Customer row would load phone (plain-text PII)
            // into memory; phone must surface ONLY in the counselor brief.
            customer: { select: { name: true } },
          },
        },
        counselor: true,
        products: { include: { product: true } },
        metrics: true,
      },
    });

    return {
      recordId: record.id,
      bookingId: record.bookingId,
      slotStartAt: record.booking.slot.startAt,
      customerName: record.booking.customer.name,
      subjectType: record.booking.subjectType,
      subjectId: record.booking.subjectId,
      counselorName: record.counselor.name,
      outcome: record.outcome,
      summary: record.summary,
      recommendation: record.recommendation,
      followUp: record.followUp,
      actions: record.actions,
      products: record.products.map((p) => p.product.name),
      metricKeys: record.metrics.map((m) => m.metricKey),
    };
  }

  async getRecordsList(page: number, limit: number): Promise<AnalyticsRecordsList> {
    const skip = (page - 1) * limit;
    const [records, total] = await Promise.all([
      this.prisma.consultationRecord.findMany({
        skip,
        take: limit,
        orderBy: { booking: { slot: { startAt: 'desc' } } },
        include: {
          // PII narrowing (ADR 0016): only the customer display name is needed
          // for the list row — never the phone (plain-text PII lives only in the
          // counselor brief).
          booking: { include: { slot: true, customer: { select: { name: true } } } },
          counselor: true,
        },
      }),
      this.prisma.consultationRecord.count(),
    ]);

    const data: AnalyticsRecordRow[] = records.map((r) => ({
      recordId: r.id,
      slotStartAt: r.booking.slot.startAt,
      customerName: r.booking.customer.name,
      counselorName: r.counselor.name,
      subjectType: r.booking.subjectType,
      outcome: r.outcome,
    }));

    return { data, total, page, limit };
  }

  private async countTotalRecords(counselorId?: string): Promise<number> {
    return this.prisma.consultationRecord.count({
      where: counselorId ? { counselorId } : undefined,
    });
  }

  private async groupByOutcome(counselorId?: string) {
    return this.prisma.consultationRecord.groupBy({
      by: ['outcome'],
      where: counselorId ? { counselorId } : undefined,
      _count: { outcome: true },
      orderBy: { outcome: 'asc' },
    });
  }

  private buildOutcomeDistribution(
    groups: { outcome: Outcome; _count: { outcome: number } }[],
  ): OutcomeDistribution {
    const dist: OutcomeDistribution = {
      EXPLAINED: 0,
      GUIDED: 0,
      PURCHASED: 0,
    };
    for (const g of groups) {
      dist[g.outcome] = g._count.outcome;
    }
    return dist;
  }

  private async groupByProduct(
    counselorId?: string,
  ): Promise<ProductInterestItem[]> {
    const rows = await this.prisma.consultationRecordProduct.groupBy({
      by: ['productId'],
      where: counselorId ? { record: { counselorId } } : undefined,
      _count: { productId: true },
      orderBy: { _count: { productId: 'desc' } },
    });

    if (rows.length === 0) {
      return [];
    }

    const productIds = rows.map((r) => r.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true },
    });

    const nameMap = new Map<string, string>(
      products.map((p) => [p.id, p.name]),
    );

    return rows.map((r) => ({
      productId: r.productId,
      productName: nameMap.get(r.productId) ?? r.productId,
      count: r._count.productId,
    }));
  }

  // ── Ops funnel analytics (AC-A1..A4) ────────────────────────────────────

  /**
   * Counts bookings by status, scoped by slot.counselorId (AC-A1).
   * Uses a relation filter so the scope key is the slot owner, NOT
   * the (absent) counselorId column on Booking itself.
   */
  private async groupBookingFunnel(
    counselorId?: string,
  ): Promise<BookingFunnel> {
    const groups = await this.prisma.booking.groupBy({
      by: ['status'],
      where: counselorId ? { slot: { counselorId } } : undefined,
      _count: { status: true },
    });

    const funnel: BookingFunnel = {
      booked: 0,
      confirmed: 0,
      completed: 0,
      noShow: 0,
      cancelled: 0,
    };

    for (const g of groups) {
      switch (g.status) {
        case BookingStatus.PENDING:
          funnel.booked += g._count.status;
          break;
        case BookingStatus.CONFIRMED:
          funnel.confirmed += g._count.status;
          break;
        case BookingStatus.COMPLETED:
          funnel.completed += g._count.status;
          break;
        case BookingStatus.NO_SHOW:
          funnel.noShow += g._count.status;
          break;
        case BookingStatus.CANCELLED:
          funnel.cancelled += g._count.status;
          break;
      }
    }

    return funnel;
  }

  /**
   * Fraction of past isOpen slots that had at least one non-CANCELLED booking
   * (AC-A3). "Past" means endAt < now. Zero-denominator → 0.
   */
  private async computeSlotUtilization(counselorId?: string): Promise<number> {
    const now = new Date();
    const baseWhere: Prisma.AvailabilitySlotWhereInput = {
      isOpen: true,
      endAt: { lt: now },
      ...(counselorId ? { counselorId } : {}),
    };

    const [denominator, numerator] = await Promise.all([
      this.prisma.availabilitySlot.count({ where: baseWhere }),
      this.prisma.availabilitySlot.count({
        where: {
          ...baseWhere,
          bookings: {
            some: { status: { not: BookingStatus.CANCELLED } },
          },
        },
      }),
    ]);

    return denominator > 0 ? numerator / denominator : 0;
  }

  private async aggregateMetricConversion(
    counselorId?: string,
  ): Promise<MetricConversionItem[]> {
    // For each distinct metricKey in ConsultationRecordMetric, count:
    //   discussedCount = number of distinct records that mention this key
    //   purchasedCount = number of those records whose outcome = PURCHASED
    // counselorId is injected via Prisma.sql to remain fully parameterised —
    // no raw string interpolation, no injection risk.
    type RawRow = {
      metricKey: string;
      discussedCount: bigint;
      purchasedCount: bigint;
    };

    const counselorFilter = counselorId
      ? Prisma.sql`WHERE r."counselorId" = ${counselorId}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<RawRow[]>`
      SELECT
        m."metricKey",
        COUNT(DISTINCT m."recordId")::bigint            AS "discussedCount",
        COUNT(DISTINCT CASE
          WHEN r."outcome" = 'PURCHASED' THEN m."recordId"
        END)::bigint                                    AS "purchasedCount"
      FROM "ConsultationRecordMetric" m
      JOIN "ConsultationRecord" r ON r."id" = m."recordId"
      ${counselorFilter}
      GROUP BY m."metricKey"
      ORDER BY "discussedCount" DESC
    `;

    return rows.map((row) => {
      const discussed = Number(row.discussedCount);
      const purchased = Number(row.purchasedCount);
      return {
        metricKey: row.metricKey,
        discussedCount: discussed,
        purchasedCount: purchased,
        conversionRate: discussed > 0 ? purchased / discussed : 0,
      };
    });
  }

  /**
   * Counts challenge enrollments scoped through the linked record's counselor
   * (AC5). The scope key is the RECORD's counselorId (via relation filter), not
   * the denormalised ChallengeEnrollment.counselorId in isolation — the record
   * JOIN is the canonical scope (they are equal at write time).
   */
  private async countChallengeEnrollments(
    counselorId?: string,
  ): Promise<number> {
    return this.prisma.challengeEnrollment.count({
      where: counselorId ? { record: { counselorId } } : undefined,
    });
  }

  /**
   * Challenge conversion = enrolled-PURCHASED / total-PURCHASED records (AC5).
   *   numerator   = PURCHASED records that produced a challenge enrollment
   *   denominator = total PURCHASED records
   *   scope       = the RECORD's counselorId (parameterised, not the
   *                 denormalised ChallengeEnrollment.counselorId in isolation)
   * Returns `null` when the denominator is 0 (no PURCHASED records yet) and `0`
   * when PURCHASED records exist but none enrolled — distinguishing "no data"
   * from "no conversion". COUNT(DISTINCT e."id") is defensive symmetry with
   * aggregateMetricConversion even though @@unique([recordId]) already bounds it.
   */
  private async computeChallengeConversion(
    counselorId?: string,
  ): Promise<number | null> {
    type RawRow = { purchasedRecords: bigint; enrolledPurchased: bigint };

    const counselorFilter = counselorId
      ? Prisma.sql`WHERE r."counselorId" = ${counselorId}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<RawRow[]>`
      SELECT
        COUNT(*) FILTER (WHERE r."outcome" = 'PURCHASED')::bigint
          AS "purchasedRecords",
        COUNT(DISTINCT e."id") FILTER (WHERE r."outcome" = 'PURCHASED')::bigint
          AS "enrolledPurchased"
      FROM "ConsultationRecord" r
      LEFT JOIN "ChallengeEnrollment" e ON e."recordId" = r."id"
      ${counselorFilter}
    `;

    const purchased = Number(rows[0]?.purchasedRecords ?? 0);
    const enrolled = Number(rows[0]?.enrolledPurchased ?? 0);
    return purchased > 0 ? enrolled / purchased : null;
  }

  /**
   * Brief open-rate headline metric (AC-P7).
   *   numerator   = bookings with briefOpenedAt != null
   *   denominator = bookings with status IN (CONFIRMED, COMPLETED, NO_SHOW)
   *
   * The denominator uses this fixed three-status set because createRecord
   * transitions CONFIRMED → COMPLETED; using CONFIRMED alone would cause the
   * denominator to drift downward as sessions are completed, producing an
   * inflated rate. PENDING and CANCELLED are excluded as they never produce a
   * brief-open event. Mirror: noShowRate = NO_SHOW/(COMPLETED+NO_SHOW) pattern.
   *
   * Scope: slot.counselorId relation filter (own/all toggle), mirroring
   * groupBookingFunnel.
   */
  private async computeBriefOpenRate(counselorId?: string): Promise<number> {
    const scopeWhere = counselorId ? { slot: { counselorId } } : undefined;

    const denominatorStatuses = [
      BookingStatus.CONFIRMED,
      BookingStatus.COMPLETED,
      BookingStatus.NO_SHOW,
    ];

    const [denominator, numerator] = await Promise.all([
      this.prisma.booking.count({
        where: {
          ...scopeWhere,
          status: { in: denominatorStatuses },
        },
      }),
      this.prisma.booking.count({
        where: {
          ...scopeWhere,
          status: { in: denominatorStatuses },
          briefOpenedAt: { not: null },
        },
      }),
    ]);

    return denominator > 0 ? numerator / denominator : 0;
  }

  // ── Contact-logging analytics (AC-6, ADR 0016) ──────────────────────────────

  /**
   * Total contact attempts (CallLog rows), scoped via booking.slot.counselorId
   * (AC-6). [P2] The scope key is the SLOT owner via relation filter — NOT the
   * denormalised CallLog.counselorId column in isolation (the anti-pattern this
   * service explicitly warns against, see countChallengeEnrollments) — mirroring
   * groupBookingFunnel / computeBriefOpenRate.
   */
  private async countContactAttempts(counselorId?: string): Promise<number> {
    return this.prisma.callLog.count({
      where: counselorId ? { booking: { slot: { counselorId } } } : undefined,
    });
  }

  /**
   * CallLog rows grouped by outcome, scoped via booking.slot.counselorId (AC-6).
   * Reads `outcome` only — the PII-adjacent call `note` is never read here.
   */
  private async groupByCallOutcome(counselorId?: string) {
    return this.prisma.callLog.groupBy({
      by: ['outcome'],
      where: counselorId ? { booking: { slot: { counselorId } } } : undefined,
      _count: { outcome: true },
      orderBy: { outcome: 'asc' },
    });
  }

  private buildCallOutcomeDistribution(
    groups: { outcome: CallOutcome; _count: { outcome: number } }[],
  ): CallOutcomeDistribution {
    const dist: CallOutcomeDistribution = {
      CONNECTED: 0,
      NO_ANSWER: 0,
      INVALID: 0,
    };
    for (const g of groups) {
      dist[g.outcome] = g._count.outcome;
    }
    return dist;
  }

  /**
   * Self-reported no-contact rate for NO_SHOW bookings (AC-6).
   *   numerator   = NO_SHOW bookings with zero CallLogs (callLogs: { none: {} })
   *   denominator = all NO_SHOW bookings
   *   scope       = slot.counselorId relation (own/all toggle), mirroring
   *                 groupBookingFunnel. Numerator AND denominator use the SAME
   *                 relation key so there is no silent-equivalence dependency.
   *
   * Returns `null` when the denominator is 0 (no NO_SHOW bookings yet) and `0`
   * when every NO_SHOW has at least one CallLog — distinguishing "no data" from
   * "all contacted", mirroring computeChallengeConversion. This is the
   * *self-reported* rate (whether a call was logged), not actual contact.
   */
  private async computeNoShowWithoutContactRate(
    counselorId?: string,
  ): Promise<number | null> {
    const scopeWhere = counselorId ? { slot: { counselorId } } : undefined;

    const [denominator, numerator] = await Promise.all([
      this.prisma.booking.count({
        where: {
          ...scopeWhere,
          status: BookingStatus.NO_SHOW,
        },
      }),
      this.prisma.booking.count({
        where: {
          ...scopeWhere,
          status: BookingStatus.NO_SHOW,
          callLogs: { none: {} },
        },
      }),
    ]);

    return denominator > 0 ? numerator / denominator : null;
  }
}
