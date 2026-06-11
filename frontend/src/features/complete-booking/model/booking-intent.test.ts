import { describe, expect, it } from 'vitest';
import {
  bookingInputForReport,
  bookingIntentFromAggregatedSlot,
  bookingIntentFromWaitlistOffer,
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
  it('uses the selected report representative id for a waitlist offer booking', () => {
    const intent = bookingIntentFromWaitlistOffer({
      waitlistId: 'wait-1',
      slot: {
        id: 'slot-from-offer',
        startAt: '2026-06-10T09:00:00.000Z',
        endAt: '2026-06-10T10:00:00.000Z',
      },
    });

    expect(bookingInputForReport(intent, report)).toEqual({
      slotId: 'slot-from-offer',
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
