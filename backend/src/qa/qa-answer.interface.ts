/**
 * Customer-facing Q&A answer generation boundary (ADR 0018).
 *
 * Isomorphic to `GuidanceGenerator` (ADR 0014): the QaService only knows this
 * interface; each generator (Ollama, deterministic template) implements it.
 * Non-determinism (LLM output) is confined behind this boundary.
 *
 * Unlike guidance (counselor-facing PREP advice), this is INTERPRETATION-ONLY
 * for the customer: explain what an indicator measures and what the customer's
 * value / reference range / status means — never diagnosis/treatment/dosing/
 * diet/supplement advice.
 */

/** A single grounded indicator for the session's test report. */
export type QaMetricInput = {
  metricKey: string;
  label: string | null;
  value: number | string | null;
  unit: string | null;
  referenceRange: string | null;
  status: string | null;
};

/**
 * One prior conversation turn in the same session, oldest-first, used only to
 * give the LLM follow-up context (AC2 multi-turn). The answer's factual grounding
 * still comes solely from `indicators` — history is context, not a new source.
 */
export type QaHistoryTurn = {
  role: 'USER' | 'ASSISTANT';
  text: string;
};

/** Input assembled for one customer question, grounded on their own metrics. */
export type QaAnswerInput = {
  question: string;
  indicators: QaMetricInput[];
  /** Prior turns in the session, oldest-first, EXCLUDING the current question. */
  history: QaHistoryTurn[];
};

/** Generator output: the answer text plus the metricKeys it grounded on. */
export type QaAnswer = {
  text: string;
  groundedMetricRefs: string[];
};

export interface QaAnswerGenerator {
  /** Short-timeout readiness probe; never throws (fail-soft). */
  available(): Promise<boolean>;
  /** Produces the interpretation answer for the given grounded input. */
  generate(input: QaAnswerInput): Promise<QaAnswer>;
}
