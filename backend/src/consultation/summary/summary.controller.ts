import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SummaryService } from './summary.service';

/**
 * Manual sweep trigger for the AI-summary upgrade pass (ADR 0014 demo aid).
 *
 * The OpsScheduler @Interval drives `sweepPendingUpgrades` automatically; this
 * endpoint lets an ADMIN trigger one sweep cycle on demand (e.g. right after
 * `ollama pull gemma3n:e4b`) without waiting for the next interval tick.
 */
@ApiTags('summary')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/summary')
export class SummaryController {
  constructor(private readonly summaryService: SummaryService) {}

  @Post('sweep')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Manually run one AI-summary upgrade sweep (FALLBACK → UPGRADED)',
  })
  async sweep(): Promise<{ upgraded: number }> {
    const upgraded = await this.summaryService.sweepPendingUpgrades();
    return { upgraded };
  }
}
