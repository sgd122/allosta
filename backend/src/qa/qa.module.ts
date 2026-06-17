import { Module } from '@nestjs/common';
import { QaController } from './qa.controller';
import { QaService } from './qa.service';
import { OllamaQaGenerator } from './ollama.qa';
import { TemplateQaGenerator } from './template.qa';

/**
 * Customer-facing AI Q&A module (ADR 0018). PrismaService, OwnershipService and
 * ConfigService come from @Global modules. Provides both answer generators (LLM
 * + deterministic template) so the service can fail-soft between them.
 */
@Module({
  controllers: [QaController],
  providers: [QaService, OllamaQaGenerator, TemplateQaGenerator],
  exports: [QaService],
})
export class QaModule {}
