import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import {
  NotificationChannelAdapter,
  NotificationPayload,
} from './notification-channel.interface';

/**
 * REAL console channel adapter.
 * Prints a formatted notification line via Nest Logger so it appears in
 * structured server logs and is visible during demo / CI runs.
 */
@Injectable()
export class ConsoleChannelAdapter implements NotificationChannelAdapter {
  readonly channel: NotificationChannel = NotificationChannel.CONSOLE;

  private readonly logger = new Logger(ConsoleChannelAdapter.name);

  async send(notification: NotificationPayload): Promise<void> {
    const ref = notification.bookingId
      ? `booking:${notification.bookingId}`
      : 'booking:n/a';

    const scheduled = notification.scheduledAt
      ? ` scheduled=${notification.scheduledAt.toISOString()}`
      : '';

    this.logger.log(
      `[NOTIFICATION] id=${notification.id} type=${notification.type} ref=${ref}${scheduled}`,
    );
  }
}
