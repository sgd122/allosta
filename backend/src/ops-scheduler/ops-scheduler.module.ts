import { Module } from '@nestjs/common';
import { BookingModule } from '../booking/booking.module';
import { WaitlistModule } from '../waitlist/waitlist.module';
import { SummaryModule } from '../consultation/summary/summary.module';
import { OpsSchedulerService } from './ops-scheduler.service';

/**
 * OpsScheduler module — owns lifecycle-sweep scheduling.
 *
 * Imports BookingModule (sweepNoShows, sweepStalePending), WaitlistModule
 * (sweepWaitlistOffers), and SummaryModule (sweepPendingUpgrades — the local-LLM
 * FALLBACK→UPGRADED sweep, ADR 0014). Does NOT import controllers — sweeps are
 * internal. PrismaService is provided by the global PrismaModule.
 * ScheduleModule.forRoot() is already registered in AppModule.
 */
@Module({
  imports: [BookingModule, WaitlistModule, SummaryModule],
  providers: [OpsSchedulerService],
})
export class OpsSchedulerModule {}
