import type { Outcome, SubjectType } from '@/shared/config';
import type { ConsultationActionType } from '@/entities/consultation-record';

export interface BookingFunnel {
  booked: number;
  confirmed: number;
  completed: number;
  noShow: number;
  cancelled: number;
}

/**
 * Customer AI Q&A deflection metrics (ADR 0018, AC10). GLOBAL scope
 * (counselor-agnostic) — rendered with the label "전체 (상담사 무관)". `null`
 * rates mean "no data yet" (denominator 0), distinct from a 0 rate.
 */
export interface QaDeflection {
  helpfulnessRate: number | null;
  behavioralDeflectionRate: number | null;
  sessionCount: number;
}

export interface Analytics {
  totalRecords: number;
  conversionRate: number;
  outcomeDistribution: Record<Outcome, number>;
  productInterest: { productId: string; productName: string; count: number }[];
  metricConversion: {
    metricKey: string;
    discussedCount: number;
    purchasedCount: number;
    conversionRate: number;
  }[];
  funnel: BookingFunnel;
  noShowRate: number;
  slotUtilization: number;
  challengeEnrollments: number;
  challengeConversionRate: number | null;
  /**
   * Fraction of bookings (CONFIRMED | COMPLETED | NO_SHOW) whose pre-consultation
   * brief was opened by the counselor (AC-P7). Zero when the denominator is zero.
   */
  briefOpenRate: number;
  /** Customer AI Q&A deflection metrics (AC10), global scope. */
  qaDeflection: QaDeflection;
}

export interface RecordListItem {
  recordId: string;
  slotStartAt: string;
  customerName: string;
  counselorName: string;
  subjectType: SubjectType;
  outcome: Outcome;
}

export interface RecordsPage {
  data: RecordListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface DrilldownDetail {
  recordId: string;
  bookingId: string;
  slotStartAt: string;
  customerName: string;
  subjectType: SubjectType;
  subjectId: string;
  counselorName: string;
  outcome: Outcome;
  summary: string;
  recommendation: string;
  followUp: string | null;
  actions: ConsultationActionType[];
  products: string[];
  metricKeys: string[];
}

export type OutcomeDonutProps = {
  distribution: Record<Outcome, number>;
  total: number;
};

export type ProductInterestBarsProps = {
  items: Analytics['productInterest'];
};

export type MetricConversionTableProps = {
  rows: Analytics['metricConversion'];
};
