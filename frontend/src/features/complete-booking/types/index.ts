export type BookingIntentSource = 'calendar-slot' | 'waitlist-offer';

export interface BookingIntent {
  source: BookingIntentSource;
  slotId: string;
  startAt: string;
  endAt: string;
  waitlistId?: string;
}

export interface WaitlistOfferSlot {
  id: string;
  startAt: string;
  endAt: string;
}

export interface CompleteBookingDialogProps {
  intent: BookingIntent | null;
  onClose: () => void;
  onCompleted?: () => void;
}
