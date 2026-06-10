import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import {
  NotificationChannelAdapter,
  NotificationPayload,
} from './notification-channel.interface';

/**
 * STUB email channel adapter — design-boundary adapter (plan §2.1 principle 4).
 *
 * Non-goal for this MVP: real email delivery requires an external SMTP / SES
 * provider, which breaks the "zero external accounts" reproducibility constraint
 * (plan §2.2 driver 1). The adapter boundary is expressed here so a real
 * implementation (e.g. nodemailer + SES) can be dropped in without touching
 * the scheduler or service layer.
 *
 * send() is a deliberate no-op with a Logger.warn so that a stray EMAIL row
 * never crashes the scheduler during demo runs.
 */
@Injectable()
export class EmailChannelAdapter implements NotificationChannelAdapter {
  readonly channel: NotificationChannel = NotificationChannel.EMAIL;

  private readonly logger = new Logger(EmailChannelAdapter.name);

  async send(notification: NotificationPayload): Promise<void> {
    // Design boundary: EMAIL delivery is a Non-goal for this demo (plan §2.1 p4).
    // Replace this no-op with an SMTP/SES call when a real provider is available.
    this.logger.warn(
      `[EMAIL STUB] Notification ${notification.id} (${notification.type}) — email delivery not implemented in this demo build.`,
    );
  }
}
