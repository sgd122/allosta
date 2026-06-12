import type { SubjectType, Outcome } from '@/shared/config';

/**
 * A single interpreted indicator surfaced in the pre-consultation brief.
 * Mirrors the backend `BriefIndicator` (consultation.service.ts) one-for-one;
 * `status` carries the BioCom 판정 ('정상' | '주의' | '위험' or null).
 */
export interface BriefIndicator {
  testResultId: string;
  serviceType: string;
  metricKey: string;
  label: string | null;
  value: number | string | null;
  unit: string | null;
  referenceRange: string | null;
  status: string | null;
}

/** A prior consultation record for the brief subject (newest first). */
export interface BriefPastRecord {
  id: string;
  createdAt: string;
  outcome: Outcome;
  summary: string;
  recommendation: string;
}

/** One ACCEPTED family member linked to the subject (read-only context). */
export interface BriefFamilyContext {
  customerId: string;
  name: string;
}

/**
 * The read-only, deterministic pre-consultation brief for a booking. Every
 * field is a derived projection of existing data (TestResult metrics, past
 * ConsultationRecords, ACCEPTED FamilyLink context, the customer's optional
 * `concern`). Fetching this marks the booking as opened server-side
 * (briefOpenedAt), which feeds the analytics brief-open-rate metric.
 */
export interface BookingBrief {
  bookingId: string;
  subjectType: SubjectType;
  subjectId: string;
  subjectName: string;
  concern: string | null;
  indicators: BriefIndicator[];
  pastRecords: BriefPastRecord[];
  family: BriefFamilyContext[];
}
