import { Module } from '@nestjs/common';
import { BookingModule } from '../booking/booking.module';
import { WaitlistModule } from '../waitlist/waitlist.module';
import { GuidanceModule } from '../consultation/guidance/guidance.module';
import { OpsSchedulerService } from './ops-scheduler.service';

/**
 * OpsScheduler module — owns lifecycle-sweep scheduling.
 *
 * Imports BookingModule (sweepNoShows, sweepStalePending), WaitlistModule
 * (sweepWaitlistOffers), and GuidanceModule (sweepPendingUpgrades — the local-LLM
 * FALLBACK→UPGRADED guidance sweep, ADR 0014). Does NOT import controllers —
 * sweeps are internal. PrismaService is provided by the global PrismaModule.
 * ScheduleModule.forRoot() is already registered in AppModule.
 */
@Module({
  imports: [BookingModule, WaitlistModule, GuidanceModule],
  providers: [OpsSchedulerService],
})
export class OpsSchedulerModule {}
