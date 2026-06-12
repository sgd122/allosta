import type { BriefIndicator } from '../types';

/**
 * Whether an indicator's 판정 is out-of-range / needs attention. The backend
 * already sorts indicators by `metricKey asc`; this predicate lets the UI lift
 * abnormal rows to the top and color them semantically without re-deriving any
 * source of truth. '주의' (caution) and '위험' (danger) are abnormal; '정상'
 * (normal), null, and unknown strings are not.
 */
export function isAbnormalStatus(status: string | null): boolean {
  return status === '주의' || status === '위험';
}

/** Count of indicators currently flagged out-of-range, for the brief header. */
export function countAbnormalIndicators(indicators: readonly BriefIndicator[]): number {
  return indicators.reduce((sum, indicator) => sum + (isAbnormalStatus(indicator.status) ? 1 : 0), 0);
}

/**
 * Returns indicators with abnormal 판정 first, preserving the backend's
 * deterministic `metricKey asc` order within each group. Pure — never mutates
 * the input (stable partition into [abnormal, normal]).
 */
export function abnormalFirst(indicators: readonly BriefIndicator[]): BriefIndicator[] {
  const abnormal: BriefIndicator[] = [];
  const normal: BriefIndicator[] = [];
  for (const indicator of indicators) {
    (isAbnormalStatus(indicator.status) ? abnormal : normal).push(indicator);
  }
  return [...abnormal, ...normal];
}
