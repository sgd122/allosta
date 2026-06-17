import { QaMetricInput } from './qa-answer.interface';

/**
 * Normalizes a raw `TestResult.metrics` JSON value into typed QA indicators.
 * Mirrors `GuidanceService.normalizeIndicators` (ADR 0014) but additionally
 * carries `referenceRange`, which the customer-facing interpretation needs.
 * Handles the array-of-objects shape (BioCom convention) and a flat key→value
 * object as a fallback. Pure and deterministic.
 */
export function normalizeQaMetrics(raw: unknown): QaMetricInput[] {
  const toValue = (v: unknown): number | string | null =>
    typeof v === 'number' || typeof v === 'string' ? v : null;
  const toText = (v: unknown): string | null =>
    typeof v === 'string' ? v : null;

  if (Array.isArray(raw)) {
    const out: QaMetricInput[] = [];
    for (const entry of raw) {
      if (typeof entry !== 'object' || entry === null) {
        continue;
      }
      const m = entry as Record<string, unknown>;
      const metricKey = typeof m.metricKey === 'string' ? m.metricKey : null;
      if (!metricKey) {
        continue;
      }
      out.push({
        metricKey,
        label: toText(m.label),
        value: toValue(m.value),
        unit: toText(m.unit),
        referenceRange: toText(m.referenceRange),
        status: toText(m.status),
      });
    }
    return out.sort((a, b) => a.metricKey.localeCompare(b.metricKey));
  }

  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>)
      .map(([metricKey, v]) => ({
        metricKey,
        label: null,
        value: toValue(v),
        unit: null,
        referenceRange: null,
        status: null,
      }))
      .sort((a, b) => a.metricKey.localeCompare(b.metricKey));
  }

  return [];
}
