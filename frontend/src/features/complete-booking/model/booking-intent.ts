import { representativeResultId, type TestReport } from '@/entities/test-result/lib/reports';
import type { AggregatedSlot, CreateBookingInput } from '@/entities/booking';
import type { BookingIntent, BookingIntentSource, WaitlistOfferSlot } from '../types';

export type { BookingIntentSource, BookingIntent, WaitlistOfferSlot };

export function bookingIntentFromAggregatedSlot(slot: AggregatedSlot): BookingIntent {
  return {
    source: 'calendar-slot',
    slotId: slot.slotId,
    startAt: slot.startAt,
    endAt: slot.endAt,
  };
}

export function bookingIntentFromWaitlistOffer({
  waitlistId,
  slot,
}: {
  waitlistId: string;
  slot: WaitlistOfferSlot;
}): BookingIntent {
  return {
    source: 'waitlist-offer',
    waitlistId,
    slotId: slot.id,
    startAt: slot.startAt,
    endAt: slot.endAt,
  };
}

export function bookingInputForReport(
  intent: BookingIntent,
  report: TestReport,
  concern?: string,
): CreateBookingInput {
  const trimmed = concern?.trim();
  return {
    slotId: intent.slotId,
    testResultId: representativeResultId(report),
    // Omit the field entirely when blank so the optional DTO stays untouched.
    ...(trimmed ? { concern: trimmed } : {}),
  };
}
