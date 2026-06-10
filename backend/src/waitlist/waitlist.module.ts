import { Module } from '@nestjs/common';
import { WaitlistController } from './waitlist.controller';
import { WaitlistService } from './waitlist.service';

/**
 * Waitlist module (R4 / AC10). Exports WaitlistService so BookingModule can
 * invoke promoteOnCancellation inside its cancellation transaction.
 */
@Module({
  controllers: [WaitlistController],
  providers: [WaitlistService],
  exports: [WaitlistService],
})
export class WaitlistModule {}
