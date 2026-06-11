import { describe, expect, it } from 'vitest';
import { buildConsultationRecordInput, createRecordDraft, toggleDraftValue } from './draft';

describe('consultation record draft', () => {
  it('builds trimmed create input and keeps a selected create-only challenge', () => {
    const draft = createRecordDraft({
      summary: '  설명  ',
      recommendation: '  권고  ',
      followUp: '   ',
      actions: ['METRIC_EXPLAINED'],
      outcome: 'PURCHASED',
      productIds: ['p1'],
      metricRefs: [{ testResultId: 'r1', metricKey: 'LDL' }],
      challengeId: 'challenge-1',
    });

    expect(buildConsultationRecordInput('booking-1', draft, 'create')).toEqual({
      bookingId: 'booking-1',
      summary: '설명',
      recommendation: '권고',
      followUp: undefined,
      actions: ['METRIC_EXPLAINED'],
      outcome: 'PURCHASED',
      interestedProductIds: ['p1'],
      metricRefs: [{ testResultId: 'r1', metricKey: 'LDL' }],
      challengeId: 'challenge-1',
    });
  });

  it('drops challenge enrollment in edit mode', () => {
    const draft = createRecordDraft({
      summary: '설명',
      recommendation: '권고',
      followUp: null,
      actions: [],
      outcome: 'PURCHASED',
      productIds: [],
      metricRefs: [],
      challengeId: 'challenge-1',
    });

    expect(buildConsultationRecordInput('booking-1', draft, 'edit').challengeId).toBeUndefined();
  });

  it('toggles set-like draft values without mutating the previous set', () => {
    const before = new Set(['a']);
    const after = toggleDraftValue(before, 'a');

    expect(Array.from(before)).toEqual(['a']);
    expect(Array.from(after)).toEqual([]);
    expect(Array.from(toggleDraftValue(after, 'b'))).toEqual(['b']);
  });
});
