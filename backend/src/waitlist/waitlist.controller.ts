import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role, Waitlist } from '@prisma/client';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { WaitlistService } from './waitlist.service';
import { CreateWaitlistDto } from './dto/create-waitlist.dto';

@ApiTags('waitlist')
@Controller('waitlist')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Get()
  @Roles(Role.CUSTOMER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "List the current customer's waitlist entries with offer info" })
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.waitlistService.findByCustomer(user.customerId as string);
  }

  @Post()
  @Roles(Role.CUSTOMER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Join a counselor waitlist when no slot is available' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWaitlistDto,
  ): Promise<Waitlist> {
    return this.waitlistService.create(
      user.customerId as string,
      dto.counselorId,
      dto.subjectType,
      dto.subjectId,
    );
  }
}
