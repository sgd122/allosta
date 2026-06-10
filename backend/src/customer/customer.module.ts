import { Module } from '@nestjs/common';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';

/**
 * Customer read module (plan §4 Phase2).
 * Exposes GET /me and GET /me/family-members for CUSTOMER role.
 * PrismaService is injected via the @Global PrismaModule.
 */
@Module({
  controllers: [CustomerController],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomerModule {}
