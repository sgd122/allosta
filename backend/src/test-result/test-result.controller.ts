import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { TestResultService, TestResultDto } from './test-result.service';

@ApiTags('test-results')
@Controller('test-results')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER)
export class TestResultController {
  constructor(private readonly testResultService: TestResultService) {}

  @Get()
  @ApiOperation({
    summary:
      'List all test results visible to the current customer: own results plus results of directly linked (ACCEPTED) family members (AC2, AC8, AC10)',
  })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TestResultDto[]> {
    return this.testResultService.findForCustomer(user.customerId as string);
  }
}
