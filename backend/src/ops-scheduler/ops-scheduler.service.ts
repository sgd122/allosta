import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { BookingService } from '../booking/booking.service';
import { GuidanceService } from '../consultation/guidance/guidance.service';

/**
 * Thin timing-only scheduler for operational lifecycle sweeps.
 *
 * This class owns ONLY the @Interval timing. All domain logic lives in the
 * respective service methods (BookingService.sweepNoShows, sweepStalePending).
 * Tests call domain methods directly — they never depend on this @Interval
 * firing (AC-N3/N5).
 *
 * Interval is 5 000 ms (every 5 s) for dev-friendly determinism, mirroring
 * NotificationScheduler (plan §4 Phase 3 demo-determinism note).
 */
@Injectable()
export class OpsSchedulerService {
  private readonly logger = new Logger(OpsSchedulerService.name);

  constructor(
    private readonly bookingService: BookingService,
    private readonly guidanceService: GuidanceService,
  ) {}

  @Interval(5_000)
  async handleInterval(): Promise<void> {
    const noShows = await this.bookingService.sweepNoShows();
    const cancelled = await this.bookingService.sweepStalePending();
    // Local-LLM FALLBACK→UPGRADED sweep (ADR 0014). No-op (returns 0) when
    // Ollama is unreachable, keeping the golden path Ollama-independent.
    const upgraded = await this.guidanceService.sweepPendingUpgrades();

    if (noShows > 0) {
      this.logger.log(`OpsScheduler: ${noShows} booking(s) marked NO_SHOW`);
    }
    if (cancelled > 0) {
      this.logger.log(
        `OpsScheduler: ${cancelled} stale PENDING booking(s) cancelled`,
      );
    }
    if (upgraded > 0) {
      this.logger.log(
        `OpsScheduler: ${upgraded} consultation guidance upgraded`,
      );
    }
  }
}
