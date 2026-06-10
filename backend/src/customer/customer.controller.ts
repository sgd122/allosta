import {
  Controller,
  Get,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import {
  CustomerService,
  CustomerProfileDto,
  FamilyMemberDto,
} from './customer.service';

@ApiTags('customer')
@Controller('me')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER)
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get()
  @ApiOperation({ summary: 'Get current customer profile' })
  async getProfile(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CustomerProfileDto> {
    const profile = await this.customerService.getProfile(
      user.customerId as string,
    );
    if (!profile) {
      throw new NotFoundException('Customer profile not found');
    }
    return profile;
  }

  @Get('family-members')
  @ApiOperation({
    summary: 'List family members for the current customer (subject selector)',
  })
  getFamilyMembers(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FamilyMemberDto[]> {
    return this.customerService.getFamilyMembers(user.customerId as string);
  }
}
