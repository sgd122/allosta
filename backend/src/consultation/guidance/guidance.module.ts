import { Module } from '@nestjs/common';
import { OllamaGuidanceGenerator } from './ollama.guidance';
import { GuidanceService } from './guidance.service';
import { TemplateGuidanceGenerator } from './template.guidance';

/**
 * Guidance module (ADR 0014). Exposes GuidanceService for ConsultationModule
 * (getBookingBrief → ensureFallbackForBooking) and OpsSchedulerModule
 * (sweepPendingUpgrades). PrismaService is provided by the global PrismaModule —
 * no local import needed. No controller: upgrades run only via @Interval.
 */
@Module({
  providers: [
    GuidanceService,
    TemplateGuidanceGenerator,
    OllamaGuidanceGenerator,
  ],
  exports: [GuidanceService],
})
export class GuidanceModule {}
