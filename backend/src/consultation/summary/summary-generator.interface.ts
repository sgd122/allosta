import { Outcome } from '@prisma/client';

/**
 * Input assembled from a committed ConsultationRecord (+ relations) and fed to a
 * SummaryGenerator. Read-only / deterministic projection of existing data — no
 * new source of truth (ADR 0014). `metrics` are the discussed test metrics
 * linked to the record (sorted deterministically by the caller).
 */
export type SummaryInput = {
  recordId: string;
  outcome: Outcome;
  recommendation: string;
  /** The counselor-authored summary (distinct from the generated AI summary). */
  counselorSummary: string;
  metrics: SummaryMetricInput[];
};

/** A single discussed metric referenced by the consultation record. */
export type SummaryMetricInput = {
  metricKey: string;
  label: string | null;
  value: number | string | null;
  unit: string | null;
  status: string | null;
};

/**
 * Adapter interface for post-consultation summary generation (ADR 0014).
 * Isomorphic to `NotificationChannelAdapter` (notification-channel.interface.ts):
 * the service only knows this interface; each summarizer provides its own
 * implementation. Non-determinism (LLM output) is confined behind this boundary.
 */
export interface SummaryGenerator {
  /** Short-timeout readiness probe; never throws (fail-soft). */
  available(): Promise<boolean>;
  /** Produces the summary text for the given input. */
  generate(input: SummaryInput): Promise<string>;
}
