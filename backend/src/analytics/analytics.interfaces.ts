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
   * CONVERTED / (CONVERTED + EXPIRED) — excludes live offers
   * (NOTIFIED/WAITING) (AC-A4). Zero when denominator is zero.
   */
  waitlistConversionRate: number;
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
