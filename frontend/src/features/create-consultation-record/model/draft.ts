import type { ConsultationRecordInput } from '@/entities/consultation-record';
import type { MetricRef } from '@/entities/test-result';
import type { ConsultationRecordDraft, ConsultationRecordDraftInput } from '../types';

export type { ConsultationRecordDraft, ConsultationRecordDraftInput };

export function encodeMetric(ref: MetricRef): string {
  return `${ref.testResultId}::${ref.metricKey}`;
}

export function decodeMetric(encoded: string): MetricRef {
  const [testResultId, metricKey] = encoded.split('::');
  return { testResultId, metricKey };
}

export function createRecordDraft(input: ConsultationRecordDraftInput): ConsultationRecordDraft {
  return {
    summary: input.summary,
    recommendation: input.recommendation,
    followUp: input.followUp,
    actions: new Set(input.actions),
    outcome: input.outcome,
    productIds: new Set(input.productIds),
    metricRefs: new Set(input.metricRefs.map(encodeMetric)),
    challengeId: input.challengeId,
  };
}

export function toggleDraftValue<T>(values: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(values);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export function buildConsultationRecordInput(
  bookingId: string,
  draft: ConsultationRecordDraft,
  mode: 'create' | 'edit',
): ConsultationRecordInput {
  const followUp = draft.followUp?.trim();
  return {
    bookingId,
    summary: draft.summary.trim(),
    recommendation: draft.recommendation.trim(),
    followUp: followUp || undefined,
    actions: Array.from(draft.actions),
    outcome: draft.outcome,
    interestedProductIds: Array.from(draft.productIds),
    metricRefs: Array.from(draft.metricRefs).map(decodeMetric),
    challengeId: mode === 'create' ? draft.challengeId : undefined,
  };
}
