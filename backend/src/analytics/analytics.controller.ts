import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  DefaultValuePipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import {
  AnalyticsDashboard,
  AnalyticsDrilldownItem,
  AnalyticsRecordsList,
} from './analytics.interfaces';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * GET /admin/analytics
   *
   * Roles: ADMIN, COUNSELOR
   *
   * COUNSELOR — default = own (counselorId forced from JWT).
   *   Pass ?scope=all to opt in to the global aggregate.
   *   Any other scope value (or omitting the param) falls back to own.
   *   This keeps the safety invariant: all-scope is never the silent default.
   *
   * ADMIN — optional ?counselorId=<id> to scope to one counselor;
   *   omit the param to aggregate across all counselors.
   */
  @Get()
  @Roles(Role.ADMIN, Role.COUNSELOR)
  getDashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query('scope') scope?: string,
    @Query('counselorId') queryCounselorId?: string,
  ): Promise<AnalyticsDashboard> {
    const counselorId =
      user.role === Role.COUNSELOR
        ? scope === 'all'
          ? undefined
          : user.counselorId
        : queryCounselorId;
    return this.analyticsService.getDashboard(counselorId);
  }

  /**
   * GET /admin/analytics/records
   *
   * Roles: ADMIN only.
   * Paginated list of consultation records (most recent first).
   * ?page=1&limit=20 (defaults)
   */
  @Get('records')
  @Roles(Role.ADMIN)
  getRecordsList(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ): Promise<AnalyticsRecordsList> {
    return this.analyticsService.getRecordsList(page, limit);
  }

  /**
   * GET /admin/analytics/drilldown/:id
   *
   * Roles: ADMIN only.
   * Returns full booking + consultation-record detail for a single record id.
   */
  @Get('drilldown/:id')
  @Roles(Role.ADMIN)
  getDrilldown(@Param('id') id: string): Promise<AnalyticsDrilldownItem> {
    return this.analyticsService.getDrilldown(id);
  }
}
