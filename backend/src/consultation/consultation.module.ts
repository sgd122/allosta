import { Module } from '@nestjs/common';
import { ConsultationController } from './consultation.controller';
import { ConsultationService } from './consultation.service';

/**
 * Consultation / CRM module (Phase 2). PrismaService (@Global PrismaModule) and
 * OwnershipService (@Global CommonModule) are injected without local imports.
 */
@Module({
  controllers: [ConsultationController],
  providers: [ConsultationService],
})
export class ConsultationModule {}
