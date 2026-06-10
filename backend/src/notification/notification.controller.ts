import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Notification, Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { NotificationService } from './notification.service';

@ApiTags('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * GET /notifications — returns notifications for the authenticated customer.
   * AC5: in-app delivery is "delivered" by being readable here (status=SENT).
   */
  @Get('notifications')
  @Roles(Role.CUSTOMER)
  @ApiOperation({ summary: 'List notifications for the current customer (AC5)' })
  getForCustomer(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Notification[]> {
    return this.notificationService.getForCustomer(user.customerId as string);
  }

  /**
   * POST /admin/notifications/dispatch — dev trigger for deterministic demo.
   * Immediately dispatches all due PENDING notifications and returns count.
   * Plan §4 Phase 3 — Architect demo-determinism: manual trigger endpoint.
   */
  @Post('admin/notifications/dispatch')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Admin dev-trigger: dispatch all due PENDING notifications (AC5 demo)',
  })
  async triggerDispatch(): Promise<{ dispatched: number }> {
    const dispatched = await this.notificationService.dispatchPending();
    return { dispatched };
  }
}
