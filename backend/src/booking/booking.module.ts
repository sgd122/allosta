import { Module } from '@nestjs/common';
import { WaitlistModule } from '../waitlist/waitlist.module';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';

/**
 * Booking module (AC1/AC2/AC3/AC10). Imports WaitlistModule to call
 * WaitlistService.promoteOnCancellation inside the cancellation transaction.
 * PrismaService, OwnershipService and ConfigService come from @Global modules.
 */
@Module({
  imports: [WaitlistModule],
  controllers: [BookingController],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}
