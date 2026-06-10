import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { NotificationService } from './notification.service';

/**
 * Scheduler that periodically dispatches due PENDING notifications.
 *
 * Interval is 5 000 ms (every 5 s) for dev-friendly determinism during demo
 * (plan §4 Phase 3 — Architect demo-determinism note).
 *
 * In production this would use a longer interval or a proper job queue.
 */
@Injectable()
export class NotificationScheduler {
  private readonly logger = new Logger(NotificationScheduler.name);

  constructor(private readonly notificationService: NotificationService) {}

  @Interval(5_000)
  async handleInterval(): Promise<void> {
    const dispatched = await this.notificationService.dispatchPending();
    if (dispatched > 0) {
      this.logger.log(`Scheduler dispatched ${dispatched} notification(s)`);
    }
  }
}
