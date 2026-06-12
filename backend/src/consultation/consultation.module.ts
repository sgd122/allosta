import { Module } from '@nestjs/common';
import { ConsultationController } from './consultation.controller';
import { ConsultationService } from './consultation.service';
import { SummaryModule } from './summary/summary.module';

/**
 * Consultation / CRM module (Phase 2). PrismaService (@Global PrismaModule) and
 * OwnershipService (@Global CommonModule) are injected without local imports.
 * SummaryModule (ADR 0014) is imported so ConsultationService can inject
 * SummaryService for the post-createRecord FALLBACK persistence.
 */
@Module({
  imports: [SummaryModule],
  controllers: [ConsultationController],
  providers: [ConsultationService],
})
export class ConsultationModule {}
