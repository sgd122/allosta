import { Module } from '@nestjs/common';
import { SummaryController } from './summary.controller';
import { OllamaSummarizer } from './ollama.summarizer';
import { SummaryService } from './summary.service';
import { TemplateSummarizer } from './template.summarizer';

/**
 * Summary module (ADR 0014). Exposes SummaryService for ConsultationModule
 * (createRecord → persistFallback) and OpsSchedulerModule (sweepPendingUpgrades).
 * PrismaService is provided by the global PrismaModule — no local import needed.
 */
@Module({
  controllers: [SummaryController],
  providers: [SummaryService, TemplateSummarizer, OllamaSummarizer],
  exports: [SummaryService],
})
export class SummaryModule {}
