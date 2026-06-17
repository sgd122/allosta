import type { QaMessage } from '@/entities/qa';

/**
 * Whether the ASSISTANT turn at `index` should show the booking CTA + disclaimer.
 * True only when it answers a QUESTION-side out-of-scope decline (the preceding
 * USER turn was classified `inScope === false`). Answer-side guardrail trips are
 * deterministic template interpretations, not declines — they get no CTA, so the
 * in-scope UX stays clean (ADR 0018, AC5/AC8).
 */
export function isEscalation(messages: QaMessage[], index: number): boolean {
  const message = messages[index];
  if (message?.role !== 'ASSISTANT') {
    return false;
  }
  const previous = messages[index - 1];
  return previous?.role === 'USER' && previous.inScope === false;
}
