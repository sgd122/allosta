import { describe, expect, it } from 'vitest';
import { isEscalation } from './escalation';
import type { QaMessage } from '@/entities/qa';

const msg = (over: Partial<QaMessage>): QaMessage => ({
  id: 'm',
  sessionId: 's',
  role: 'ASSISTANT',
  text: 't',
  groundedMetricRefs: [],
  source: null,
  inScope: null,
  feedback: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('isEscalation', () => {
  it('escalates an assistant turn answering an out-of-scope question', () => {
    const messages = [
      msg({ role: 'USER', inScope: false }),
      msg({ role: 'ASSISTANT', source: 'FALLBACK_GUARDRAIL' }),
    ];
    expect(isEscalation(messages, 1)).toBe(true);
  });

  it('does not escalate an in-scope answer', () => {
    const messages = [
      msg({ role: 'USER', inScope: true }),
      msg({ role: 'ASSISTANT', source: 'LLM' }),
    ];
    expect(isEscalation(messages, 1)).toBe(false);
  });

  it('does not escalate an answer-side template fallback to an in-scope question', () => {
    const messages = [
      msg({ role: 'USER', inScope: true }),
      msg({ role: 'ASSISTANT', source: 'FALLBACK_GUARDRAIL' }),
    ];
    expect(isEscalation(messages, 1)).toBe(false);
  });

  it('never escalates a USER turn', () => {
    const messages = [msg({ role: 'USER', inScope: false })];
    expect(isEscalation(messages, 0)).toBe(false);
  });
});
