import type { SubjectType, Outcome } from '@/shared/config';

export type ConsultationActionType =
  | 'METRIC_EXPLAINED'
  | 'DIET_GUIDANCE'
  | 'SUPPLEMENT_GUIDANCE'
  | 'RETEST_GUIDANCE'
  | 'LIFESTYLE_GUIDANCE';

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
}
