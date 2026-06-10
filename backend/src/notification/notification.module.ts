import { Module } from '@nestjs/common';
import { ConsoleChannelAdapter } from './channels/console.channel';
import { InAppChannelAdapter } from './channels/in-app.channel';
import { EmailChannelAdapter } from './channels/email.channel';
import { SmsChannelAdapter } from './channels/sms.channel';
import { NotificationService } from './notification.service';
import { NotificationScheduler } from './notification.scheduler';
import { NotificationController } from './notification.controller';

/**
 * Notification module (AC5 — SIMULATED, plan §4 Phase 3).
 *
 * Owns the channel adapter registry, the 5-second dispatch scheduler, and the
 * customer-facing GET /notifications + admin POST /admin/notifications/dispatch
 * endpoints.
 *
 * Does NOT import BookingModule or WaitlistModule. Those modules INSERT
 * Notification rows as status=PENDING; this module is the consumer only.
 *
 * PrismaService is provided by the global PrismaModule.
 */
@Module({
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationScheduler,
    ConsoleChannelAdapter,
    InAppChannelAdapter,
    EmailChannelAdapter,
    SmsChannelAdapter,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
