import { Module } from '@nestjs/common';
import { BookingModule } from '../booking/booking.module';
import { GuidanceModule } from '../consultation/guidance/guidance.module';
import { OpsSchedulerService } from './ops-scheduler.service';

/**
 * OpsScheduler module — owns lifecycle-sweep scheduling.
 *
 * Imports BookingModule (sweepNoShows, sweepStalePending) and GuidanceModule
 * (sweepPendingUpgrades — the local-LLM FALLBACK→UPGRADED guidance sweep,
 * ADR 0014). Does NOT import controllers — sweeps are internal. PrismaService
 * is provided by the global PrismaModule. ScheduleModule.forRoot() is already
 * registered in AppModule.
 */
@Module({
  imports: [BookingModule, GuidanceModule],
  providers: [OpsSchedulerService],
})
export class OpsSchedulerModule {}
