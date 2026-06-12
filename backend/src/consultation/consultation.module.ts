import { Module } from '@nestjs/common';
import { ConsultationController } from './consultation.controller';
import { ConsultationService } from './consultation.service';
import { GuidanceModule } from './guidance/guidance.module';

/**
 * Consultation / CRM module (Phase 2). PrismaService (@Global PrismaModule) and
 * OwnershipService (@Global CommonModule) are injected without local imports.
 * GuidanceModule (ADR 0014) is imported so ConsultationService can inject
 * GuidanceService to attach pre-consultation guidance to the booking brief.
 */
@Module({
  imports: [GuidanceModule],
  controllers: [ConsultationController],
  providers: [ConsultationService],
})
export class ConsultationModule {}
