import { Module } from '@nestjs/common';
import {
  AdminAvailabilityController,
  AvailabilityController,
  SlotController,
} from './availability.controller';
import { AvailabilityService } from './availability.service';

/**
 * Exposes derived counselor availability (AC1) and slot CRUD (AC-S1/S2).
 * PrismaService is injected from the @Global PrismaModule.
 *
 * Controllers:
 *   AvailabilityController    — GET  /counselors/...  (read + counselor create)
 *   SlotController            — PATCH/DELETE /slots/:id  (counselor own)
 *   AdminAvailabilityController — POST/PATCH/DELETE /admin/...  (admin all)
 */
@Module({
  controllers: [
    AvailabilityController,
    SlotController,
    AdminAvailabilityController,
  ],
  providers: [AvailabilityService],
})
export class AvailabilityModule {}
