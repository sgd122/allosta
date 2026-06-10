import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import {
  NotificationChannelAdapter,
  NotificationPayload,
} from './notification-channel.interface';

/**
 * REAL in-app channel adapter.
 * Delivery is implicit: the notification row (status=SENT) is readable via
 * GET /notifications, so no external send is required.
 * send() resolves immediately; the scheduler flips status to SENT.
 */
@Injectable()
export class InAppChannelAdapter implements NotificationChannelAdapter {
  readonly channel: NotificationChannel = NotificationChannel.IN_APP;

  private readonly logger = new Logger(InAppChannelAdapter.name);

  async send(notification: NotificationPayload): Promise<void> {
    this.logger.debug(
      `[IN-APP] Notification ${notification.id} (${notification.type}) is now readable via GET /notifications`,
    );
  }
}
