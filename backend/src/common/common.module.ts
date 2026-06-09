import { Global, Module } from '@nestjs/common';
import { OwnershipService } from './ownership/ownership.service';

/**
 * Shared authorization layer reused by every feature module.
 * @Global so feature modules can inject OwnershipService without re-importing.
 */
@Global()
@Module({
  providers: [OwnershipService],
  exports: [OwnershipService],
})
export class CommonModule {}
