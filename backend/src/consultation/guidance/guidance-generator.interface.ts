import { Outcome } from '@prisma/client';

/**
 * Input assembled for a booking's UPCOMING consultation and fed to a
 * GuidanceGenerator (ADR 0014). Read-only / deterministic projection of existing
 * data — no new source of truth. `indicators` are the subject's test metrics
 * (abnormal ones flagged via `status`); `pastRecords` are the subject's prior
 * consultation records (newest first); `concern` is the customer's optional
 * pre-question. The generator advises the counselor how to PROCEED — not a
 * summary of a finished consultation.
 */
export type GuidanceInput = {
  indicators: GuidanceIndicatorInput[];
  pastRecords: GuidancePastRecordInput[];
  concern: string | null;
};

/** A single test indicator for the subject (abnormal flagged via `status`). */
export type GuidanceIndicatorInput = {
  metricKey: string;
  label: string | null;
  value: number | string | null;
  unit: string | null;
  status: string | null;
};

/** A prior consultation record for the subject (newest first). */
export type GuidancePastRecordInput = {
  outcome: Outcome;
  summary: string;
  recommendation: string;
};

/**
 * Adapter interface for pre-consultation guidance generation (ADR 0014).
 * Isomorphic to `NotificationChannelAdapter`: the service only knows this
 * interface; each generator provides its own implementation. Non-determinism
 * (LLM output) is confined behind this boundary.
 */
export interface GuidanceGenerator {
  /** Short-timeout readiness probe; never throws (fail-soft). */
  available(): Promise<boolean>;
  /** Produces the guidance text for the given input. */
  generate(input: GuidanceInput): Promise<string>;
}
