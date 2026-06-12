import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Booking, Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { BookingService, MyBookingDto } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { SetAttendanceDto } from './dto/set-attendance.dto';

@ApiTags('bookings')
@Controller('bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER)
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a pending booking for a slot from a test result (AC1/AC8/AC11)',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBookingDto,
  ): Promise<Booking> {
    return this.bookingService.create(
      user.customerId as string,
      dto.slotId,
      dto.testResultId,
      dto.concern,
    );
  }

  @Get()
  @ApiOperation({ summary: "List the current customer's bookings (AC9/AC10)" })
  findMyBookings(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MyBookingDto[]> {
    return this.bookingService.findMyBookings(user.customerId as string);
  }

  @Patch(':id/confirm')
  @Roles(Role.COUNSELOR)
  @ApiOperation({ summary: 'Confirm a pending booking as the counselor (AC12)' })
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<Booking> {
    return this.bookingService.confirm(user.counselorId as string, id);
  }

  @Patch(':id/attendance')
  @Roles(Role.COUNSELOR)
  @ApiOperation({
    summary: 'Counselor manual attendance override: set NO_SHOW or COMPLETED (AC-N4)',
  })
  setAttendance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetAttendanceDto,
  ): Promise<Booking> {
    return this.bookingService.setAttendance(
      user.counselorId as string,
      id,
      dto.status,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel a booking, freeing the slot (AC10)' })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<Booking> {
    return this.bookingService.cancel(user.customerId as string, id);
  }
}
