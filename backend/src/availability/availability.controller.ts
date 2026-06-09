import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AvailabilitySlot, Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import {
  AvailabilityService,
  AvailableSlot,
  CalendarDay,
} from './availability.service';
import { CreateSlotBatchDto } from './dto/create-slot.dto';
import { UpdateSlotDto } from './dto/update-slot.dto';

// ─── Counselor read + write routes (/counselors/...) ─────────────────────────

@ApiTags('availability')
@Controller('counselors')
@UseGuards(JwtAuthGuard)
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  // Declared BEFORE `:counselorId/slots` so the static segment wins NestJS's
  // declaration-order route matching and is not swallowed by `:counselorId`.
  @Get('availability-calendar')
  @ApiOperation({
    summary: "All counselors' open slots grouped by date (AC2/AC3/AC4)",
  })
  findAggregatedCalendar(): Promise<CalendarDay[]> {
    return this.availabilityService.findAggregatedCalendar();
  }

  /**
   * GET /counselors/slots
   *
   * Counselor lists their own upcoming slots for management (AC-S5).
   * Declared BEFORE `:counselorId/slots` — static segment wins on
   * NestJS declaration-order matching.
   */
  @Get('slots')
  @UseGuards(RolesGuard)
  @Roles(Role.COUNSELOR)
  @ApiOperation({ summary: "List counselor's own upcoming slots (AC-S5)" })
  findOwnSlots(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AvailabilitySlot[]> {
    return this.availabilityService.findOwnSlots(user.counselorId!);
  }

  @Get(':counselorId/slots')
  @ApiOperation({ summary: "List a counselor's derived-available slots (AC1)" })
  findSlots(
    @Param('counselorId') counselorId: string,
  ): Promise<AvailableSlot[]> {
    return this.availabilityService.findAvailableSlots(counselorId);
  }

  /**
   * POST /counselors/slots
   *
   * Counselor creates one or more own slots (batch, all-or-nothing).
   * The counselorId is resolved from the JWT — counselors can only create
   * slots for themselves (AC-S1).
   */
  @Post('slots')
  @UseGuards(RolesGuard)
  @Roles(Role.COUNSELOR)
  @ApiOperation({ summary: 'Create one or more slots for the authenticated counselor (AC-S1)' })
  createOwnSlots(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSlotBatchDto,
  ): Promise<AvailabilitySlot[]> {
    return this.availabilityService.createSlots(user.counselorId!, dto.slots);
  }
}

// ─── Counselor slot management (/slots/:id) ───────────────────────────────────

@ApiTags('availability')
@Controller('slots')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.COUNSELOR)
export class SlotController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  /**
   * PATCH /slots/:id
   *
   * Counselor updates their own slot (isOpen flag, time window).
   * Ownership is enforced: 403 if the slot belongs to another counselor (AC-S3).
   */
  @Patch(':id')
  @ApiOperation({ summary: "Update counselor's own slot (AC-S1/S3)" })
  updateOwnSlot(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateSlotDto,
  ): Promise<AvailabilitySlot> {
    return this.availabilityService.updateSlot(id, dto, user.counselorId!);
  }

  /**
   * DELETE /slots/:id
   *
   * Counselor deletes their own slot.
   * Blocked with 409 when an active (PENDING/CONFIRMED) booking exists (AC-S4).
   * Ownership is enforced: 403 if the slot belongs to another counselor (AC-S3).
   */
  @Delete(':id')
  @ApiOperation({ summary: "Delete counselor's own slot (AC-S1/S3/S4)" })
  deleteOwnSlot(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AvailabilitySlot> {
    return this.availabilityService.deleteSlot(id, user.counselorId!);
  }
}

// ─── Admin slot management (/admin/counselors/:id/slots, /admin/slots/:id) ───

@ApiTags('availability')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminAvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  /**
   * POST /admin/counselors/:counselorId/slots
   *
   * Admin creates one or more slots for any counselor (AC-S2).
   * Returns 404 when the target counselor does not exist.
   */
  @Post('counselors/:counselorId/slots')
  @ApiOperation({ summary: "Create slots for any counselor (admin, AC-S2)" })
  async createSlotsForCounselor(
    @Param('counselorId') counselorId: string,
    @Body() dto: CreateSlotBatchDto,
  ): Promise<AvailabilitySlot[]> {
    await this.availabilityService.assertCounselorExists(counselorId);
    return this.availabilityService.createSlots(counselorId, dto.slots);
  }

  /**
   * PATCH /admin/slots/:id
   *
   * Admin updates any counselor's slot (no ownership check).
   */
  @Patch('slots/:id')
  @ApiOperation({ summary: 'Update any slot (admin, AC-S2)' })
  updateSlot(
    @Param('id') id: string,
    @Body() dto: UpdateSlotDto,
  ): Promise<AvailabilitySlot> {
    // No requestingCounselorId — admin bypasses ownership check.
    return this.availabilityService.updateSlot(id, dto);
  }

  /**
   * DELETE /admin/slots/:id
   *
   * Admin deletes any counselor's slot.
   * Blocked with 409 when an active (PENDING/CONFIRMED) booking exists (AC-S4).
   */
  @Delete('slots/:id')
  @ApiOperation({ summary: 'Delete any slot (admin, AC-S2/S4)' })
  deleteSlot(@Param('id') id: string): Promise<AvailabilitySlot> {
    // No requestingCounselorId — admin bypasses ownership check.
    return this.availabilityService.deleteSlot(id);
  }
}
