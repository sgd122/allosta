export interface ProductInterestItem {
  productId: string;
  productName: string;
  count: number;
}

export interface MetricConversionItem {
  metricKey: string;
  discussedCount: number;
  purchasedCount: number;
  conversionRate: number;
}

export interface OutcomeDistribution {
  EXPLAINED: number;
  GUIDED: number;
  PURCHASED: number;
}

export interface CallOutcomeDistribution {
  /** Reached the customer. */
  CONNECTED: number;
  /** Dialed, no pickup. */
  NO_ANSWER: number;
  /** Number unreachable / wrong. */
  INVALID: number;
}

export interface BookingFunnel {
  /** PENDING bookings — customer booked, awaiting counselor confirmation. */
  booked: number;
  /** CONFIRMED bookings. */
  confirmed: number;
  /** COMPLETED sessions. */
  completed: number;
  /** NO_SHOW sessions (counselor sweep or manual override). */
  noShow: number;
  /** CANCELLED bookings. */
  cancelled: number;
}

export interface AnalyticsDashboard {
  totalRecords: number;
  conversionRate: number;
  outcomeDistribution: OutcomeDistribution;
  productInterest: ProductInterestItem[];
  metricConversion: MetricConversionItem[];
  /** Booking lifecycle funnel, scoped by slot.counselorId (AC-A1). */
  funnel: BookingFunnel;
  /**
   * NO_SHOW / (COMPLETED + NO_SHOW) — terminal sessions only (AC-A2).
   * Zero when denominator is zero.
   */
  noShowRate: number;
  /**
   * Fraction of past isOpen slots that had at least one non-CANCELLED booking
   * (AC-A3). Only counts slots whose endAt < now. Zero when denominator is zero.
   */
  slotUtilization: number;
  /**
   * Count of challenge enrollments, scoped through the linked record's
   * counselor (AC5). Counselor scope uses the RECORD's counselorId via JOIN.
   */
  challengeEnrollments: number;
  /**
   * Enrolled-PURCHASED / total-PURCHASED records (AC5). `null` when there are
   * no PURCHASED records yet (denominator 0); `0` when PURCHASED records exist
   * but none produced an enrollment. Distinguishes "no data" from "no conversion".
   */
  challengeConversionRate: number | null;
  /**
   * Fraction of bookings (in CONFIRMED | COMPLETED | NO_SHOW) whose
   * briefOpenedAt is non-null (AC-P7). The denominator uses this fixed set
   * because createRecord transitions CONFIRMED → COMPLETED; a CONFIRMED-only
   * denominator would drift downward as records are created. Zero when
   * denominator is zero.
   */
  briefOpenRate: number;
  /**
   * Total CallLog rows (contact attempts), scoped via booking.slot.counselorId
   * (AC-6). Counts every logged dial regardless of outcome. The scope key is the
   * SLOT owner via relation filter — NOT the denormalised CallLog.counselorId in
   * isolation — mirroring groupBookingFunnel.
   */
  contactAttempts: number;
  /**
   * CallLog rows grouped by outcome (CONNECTED | NO_ANSWER | INVALID), scoped via
   * booking.slot.counselorId (AC-6). Reads `outcome` only — the call `note` is
   * PII-adjacent and never surfaced in any aggregation (ADR 0016).
   */
  callOutcomeDistribution: CallOutcomeDistribution;
  /**
   * Fraction of NO_SHOW bookings with NO logged contact attempt (AC-6).
   *   numerator   = NO_SHOW bookings with zero CallLogs
   *   denominator = all NO_SHOW bookings
   *   scope       = slot.counselorId relation (own/all toggle), numerator AND
   *                 denominator share the same key (no silent-equivalence).
   *
   * HONESTY: this is the *self-reported* no-contact rate — it reflects whether a
   * counselor LOGGED a call, not whether contact actually occurred (a counselor
   * may dial without logging). It is gameable, but strictly more useful than zero
   * evidence when justifying a no-show override (ADR 0016).
   *
   * `null` when there are no NO_SHOW bookings yet (denominator 0); `0` when every
   * NO_SHOW has at least one CallLog. Distinguishes "no data" from "all
   * contacted", mirroring challengeConversionRate's null-vs-0 convention above.
   */
  noShowWithoutContactRate: number | null;
}

export interface AnalyticsRecordRow {
  recordId: string;
  slotStartAt: Date;
  customerName: string;
  counselorName: string;
  subjectType: string;
  outcome: string;
}

export interface AnalyticsRecordsList {
  data: AnalyticsRecordRow[];
  total: number;
  page: number;
  limit: number;
}

export interface AnalyticsDrilldownItem {
  recordId: string;
  bookingId: string;
  slotStartAt: Date;
  customerName: string;
  subjectType: string;
  subjectId: string;
  counselorName: string;
  outcome: string;
  summary: string;
  recommendation: string;
  followUp: string | null;
  actions: string[];
  products: string[];
  metricKeys: string[];
}
