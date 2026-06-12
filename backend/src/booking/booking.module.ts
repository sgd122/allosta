import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';

/**
 * Booking module (AC1/AC2/AC3). PrismaService, OwnershipService and
 * ConfigService come from @Global modules.
 */
@Module({
  controllers: [BookingController],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}
