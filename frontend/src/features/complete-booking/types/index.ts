export type BookingIntentSource = 'calendar-slot';

export interface BookingIntent {
  source: BookingIntentSource;
  slotId: string;
  startAt: string;
  endAt: string;
}

export interface CompleteBookingDialogProps {
  intent: BookingIntent | null;
  onClose: () => void;
  onCompleted?: () => void;
  onConflict?: () => void;
}
