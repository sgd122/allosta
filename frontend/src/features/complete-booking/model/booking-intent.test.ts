import { describe, expect, it } from 'vitest';
import {
  bookingInputForReport,
  bookingIntentFromAggregatedSlot,
} from './booking-intent';
import type { TestReport } from '@/entities/test-result';

const report: TestReport = {
  key: 'self:2026-06-10',
  subjectId: 'self',
  subjectName: '본인',
  isFamily: false,
  createdAt: '2026-06-10T12:00:00.000Z',
  results: [
    {
      id: 'latest-result',
      subjectType: 'CUSTOMER',
      subjectId: 'self',
      serviceType: 'GUT_MICROBIOME',
      metrics: [],
      createdAt: '2026-06-10T12:00:00.000Z',
    },
    {
      id: 'older-result',
      subjectType: 'CUSTOMER',
      subjectId: 'self',
      serviceType: 'METABOLIC_6',
      metrics: [],
      createdAt: '2026-06-10T09:00:00.000Z',
    },
  ],
};

describe('booking intent', () => {
  it('uses the selected report representative id for a calendar-slot booking', () => {
    const intent = bookingIntentFromAggregatedSlot({
      slotId: 'slot-from-calendar',
      startAt: '2026-06-10T09:00:00.000Z',
      endAt: '2026-06-10T10:00:00.000Z',
      availableCount: 1,
      counselorId: 'counselor-1',
    });

    expect(bookingInputForReport(intent, report)).toEqual({
      slotId: 'slot-from-calendar',
      testResultId: 'latest-result',
    });
  });

  it('threads a trimmed concern into the booking input when provided', () => {
    const intent = bookingIntentFromAggregatedSlot({
      slotId: 'calendar-slot',
      startAt: '2026-06-11T09:00:00.000Z',
      endAt: '2026-06-11T10:00:00.000Z',
      availableCount: 1,
      counselorId: 'counselor-1',
    });

    expect(bookingInputForReport(intent, report, '  비타민D 수치가 걱정돼요  ')).toEqual({
      slotId: 'calendar-slot',
      testResultId: 'latest-result',
      concern: '비타민D 수치가 걱정돼요',
    });
  });

  it('omits the concern field entirely when it is blank or whitespace', () => {
    const intent = bookingIntentFromAggregatedSlot({
      slotId: 'calendar-slot',
      startAt: '2026-06-11T09:00:00.000Z',
      endAt: '2026-06-11T10:00:00.000Z',
      availableCount: 1,
      counselorId: 'counselor-1',
    });

    expect(bookingInputForReport(intent, report, '   ')).toEqual({
      slotId: 'calendar-slot',
      testResultId: 'latest-result',
    });
  });

  it('normalizes an aggregated calendar slot into the same booking intent shape', () => {
    const intent = bookingIntentFromAggregatedSlot({
      slotId: 'calendar-slot',
      startAt: '2026-06-11T09:00:00.000Z',
      endAt: '2026-06-11T10:00:00.000Z',
      availableCount: 2,
      counselorId: 'counselor-1',
    });

    expect(intent).toMatchObject({
      source: 'calendar-slot',
      slotId: 'calendar-slot',
      startAt: '2026-06-11T09:00:00.000Z',
      endAt: '2026-06-11T10:00:00.000Z',
    });
  });
});
