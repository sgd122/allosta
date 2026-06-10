import { Injectable, Logger } from '@nestjs/common';
import {
  Notification,
  NotificationChannel,
  NotificationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConsoleChannelAdapter } from './channels/console.channel';
import { InAppChannelAdapter } from './channels/in-app.channel';
import { EmailChannelAdapter } from './channels/email.channel';
import { SmsChannelAdapter } from './channels/sms.channel';
import {
  NotificationChannelAdapter,
  NotificationPayload,
} from './channels/notification-channel.interface';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  /**
   * Registry: NotificationChannel enum value → adapter instance.
   * Injected adapters are registered here so the dispatcher is O(1) per row.
   */
  private readonly registry: Map<NotificationChannel, NotificationChannelAdapter>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly consoleAdapter: ConsoleChannelAdapter,
    private readonly inAppAdapter: InAppChannelAdapter,
    private readonly emailAdapter: EmailChannelAdapter,
    private readonly smsAdapter: SmsChannelAdapter,
  ) {
    this.registry = new Map<NotificationChannel, NotificationChannelAdapter>([
      [NotificationChannel.CONSOLE, consoleAdapter],
      [NotificationChannel.IN_APP, inAppAdapter],
      [NotificationChannel.EMAIL, emailAdapter],
      [NotificationChannel.SMS, smsAdapter],
    ]);
  }

  /**
   * Finds all PENDING notifications that are due (scheduledAt IS NULL or
   * scheduledAt <= now), dispatches each via its channel adapter, and
   * transitions status to SENT or FAILED.
   *
   * Returns the count of successfully dispatched notifications.
   * Called by the scheduler every 5 s and by the admin dev-trigger endpoint.
   */
  async dispatchPending(): Promise<number> {
    const now = new Date();

    const pending = await this.prisma.notification.findMany({
      where: {
        status: NotificationStatus.PENDING,
        OR: [
          { scheduledAt: null },
          { scheduledAt: { lte: now } },
        ],
      },
    });

    if (pending.length === 0) {
      return 0;
    }

    this.logger.debug(`Dispatching ${pending.length} pending notification(s)`);

    let dispatched = 0;

    for (const notification of pending) {
      const adapter = this.registry.get(notification.channel);

      if (!adapter) {
        this.logger.error(
          `No adapter registered for channel ${notification.channel} — marking FAILED`,
        );
        await this.markFailed(notification.id);
        continue;
      }

      const payload: NotificationPayload = {
        id: notification.id,
        type: notification.type,
        bookingId: notification.bookingId ?? undefined,
        waitlistId: notification.waitlistId ?? undefined,
        scheduledAt: notification.scheduledAt ?? undefined,
      };

      try {
        await adapter.send(payload);
        await this.markSent(notification.id);
        dispatched++;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Adapter ${notification.channel} failed for notification ${notification.id}: ${message}`,
        );
        await this.markFailed(notification.id);
      }
    }

    return dispatched;
  }

  /**
   * Returns notifications visible to a given customer — those linked to the
   * customer's own bookings or waitlist entries, ordered most-recent first.
   */
  async getForCustomer(customerId: string): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: {
        OR: [
          {
            booking: { customerId },
          },
          {
            waitlist: { customerId },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async markSent(id: string): Promise<void> {
    await this.prisma.notification.update({
      where: { id },
      data: {
        status: NotificationStatus.SENT,
        sentAt: new Date(),
      },
    });
  }

  private async markFailed(id: string): Promise<void> {
    await this.prisma.notification.update({
      where: { id },
      data: { status: NotificationStatus.FAILED },
    });
  }
}
