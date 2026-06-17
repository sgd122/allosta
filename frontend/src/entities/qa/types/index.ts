/** Customer-facing AI Q&A on test results (ADR 0018). */

export type QaMessageRole = 'USER' | 'ASSISTANT';

export type QaMessageSource =
  | 'LLM'
  | 'FALLBACK_UNAVAILABLE'
  | 'FALLBACK_TIMEOUT'
  | 'FALLBACK_SATURATED'
  | 'FALLBACK_GUARDRAIL';

export type QaFeedback = 'YES' | 'NO';

export interface QaMessage {
  id: string;
  sessionId: string;
  role: QaMessageRole;
  text: string;
  groundedMetricRefs: string[];
  /** null on USER turns; LLM or FALLBACK_* on ASSISTANT turns. */
  source: QaMessageSource | null;
  /** USER-turn scope classification; false ⇒ declined + escalated. */
  inScope: boolean | null;
  feedback: QaFeedback | null;
  createdAt: string;
}

export interface QaSession {
  id: string;
  customerId: string;
  subjectType: string;
  subjectId: string;
  testResultId: string | null;
  createdAt: string;
}

export interface QaSessionWithMessages extends QaSession {
  messages: QaMessage[];
}

/** ASSISTANT turn returned by POST .../messages, plus the escalation flag. */
export interface QaAskResult extends QaMessage {
  /** True only for QUESTION-side out-of-scope declines → show booking CTA. */
  escalate: boolean;
}
