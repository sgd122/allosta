import type { SubjectType, Outcome } from '@/shared/config';

export type ConsultationActionType =
  | 'METRIC_EXPLAINED'
  | 'DIET_GUIDANCE'
  | 'SUPPLEMENT_GUIDANCE'
  | 'RETEST_GUIDANCE'
  | 'LIFESTYLE_GUIDANCE';

/**
 * Lifecycle of the post-consultation AI summary (ADR 0014). A deterministic
 * template FALLBACK is persisted synchronously after the record is created; a
 * local Ollama (gemma3n:e4b) sweep idempotently promotes it to UPGRADED.
 */
export type AiSummaryStatus = 'FALLBACK' | 'UPGRADED';

export interface ConsultationAiSummary {
  status: AiSummaryStatus;
  /** Model name when UPGRADED (e.g. "gemma3n:e4b"); null on FALLBACK. */
  model: string | null;
  content: string;
}

export interface ConsultationRecordInput {
  bookingId: string;
  summary: string;
  recommendation: string;
  followUp?: string;
  actions: ConsultationActionType[];
  outcome: Outcome;
  interestedProductIds: string[];
  metricRefs: { testResultId: string; metricKey: string }[];
  challengeId?: string;
}

export interface CounselorRecordEntry {
  id: string;
  bookingId: string;
  summary: string;
  recommendation: string;
  followUp: string | null;
  actions: ConsultationActionType[];
  outcome: Outcome;
  createdAt: string;
  slot: { startAt: string; endAt: string };
  subjectType: SubjectType;
  subjectId: string;
  subjectName: string;
  customerName: string;
  products: { productId: string; name: string; category: string }[];
  metrics: { testResultId: string; metricKey: string }[];
  /**
   * Post-consultation AI summary (ADR 0014). Optional: present only once the
   * backend exposes the ConsultationAiSummary relation on this endpoint. The
   * UI renders the FALLBACK/UPGRADED badge whenever it is supplied.
   */
  aiSummary?: ConsultationAiSummary | null;
}
