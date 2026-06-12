import { NotificationChannel, NotificationType } from '@prisma/client';

/**
 * Payload routed to each channel adapter.
 * Named separately from the Prisma `NotificationChannel` enum to avoid clash.
 */
export type NotificationPayload = {
  id: string;
  type: NotificationType;
  bookingId?: string;
  scheduledAt?: Date;
};

/**
 * Adapter interface for notification delivery channels (plan §2.1 principle 4 —
 * "Non-goal expressed as adapter boundary").
 * Each channel provides its own implementation; the scheduler only knows this interface.
 */
export interface NotificationChannelAdapter {
  readonly channel: NotificationChannel;
  send(notification: NotificationPayload): Promise<void>;
}
