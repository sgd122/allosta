import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import {
  NotificationChannelAdapter,
  NotificationPayload,
} from './notification-channel.interface';

/**
 * STUB SMS channel adapter — design-boundary adapter (plan §2.1 principle 4).
 *
 * Non-goal for this MVP: real SMS delivery requires an external provider
 * (Twilio, Kakao Alimtalk, etc.), which breaks the "zero external accounts"
 * reproducibility constraint (plan §2.2 driver 1). The adapter boundary is
 * expressed here so a real implementation can be dropped in without touching
 * the scheduler or service layer.
 *
 * send() is a deliberate no-op with a Logger.warn so that a stray SMS row
 * never crashes the scheduler during demo runs.
 */
@Injectable()
export class SmsChannelAdapter implements NotificationChannelAdapter {
  readonly channel: NotificationChannel = NotificationChannel.SMS;

  private readonly logger = new Logger(SmsChannelAdapter.name);

  async send(notification: NotificationPayload): Promise<void> {
    // Design boundary: SMS delivery is a Non-goal for this demo (plan §2.1 p4).
    // Replace this no-op with a Twilio/Kakao call when a real provider is available.
    this.logger.warn(
      `[SMS STUB] Notification ${notification.id} (${notification.type}) — SMS delivery not implemented in this demo build.`,
    );
  }
}
