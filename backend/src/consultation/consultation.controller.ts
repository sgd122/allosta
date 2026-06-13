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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import {
  BookingBrief,
  CallLogReceipt,
  ChallengeCatalogItem,
  ConsultationRecordWithRelations,
  ConsultationService,
  CounselorRecordEntry,
  CounselorScheduleEntry,
  ProductCatalogItem,
  SubjectTestResultDto,
} from './consultation.service';
import {
  CreateConsultationRecordDto,
  UpdateConsultationRecordDto,
} from './dto/create-consultation-record.dto';
import { LogCallDto, UpdateCallLogDto } from './dto/log-call.dto';

@ApiTags('consultation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ConsultationController {
  constructor(private readonly consultationService: ConsultationService) {}

  @Get('counselor/schedule')
  @Roles(Role.COUNSELOR)
  @ApiOperation({ summary: "List the current counselor's active and completed bookings with status (AC4/AC14)" })
  getSchedule(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CounselorScheduleEntry[]> {
    return this.consultationService.getCounselorSchedule(user.counselorId!);
  }

  @Get('counselor/records')
  @Roles(Role.COUNSELOR)
  @ApiOperation({ summary: "List the counselor's own written records with enriched relations (AC16)" })
  getCounselorRecords(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CounselorRecordEntry[]> {
    return this.consultationService.getCounselorRecords(user.counselorId!);
  }

  @Get('counselor/bookings/:bookingId/test-results')
  @Roles(Role.COUNSELOR)
  @ApiOperation({ summary: "Return the booking subject's test results for metric autosuggest (AC12)" })
  getBookingSubjectTestResults(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId') bookingId: string,
  ): Promise<SubjectTestResultDto[]> {
    return this.consultationService.getBookingSubjectTestResults(
      user.counselorId!,
      bookingId,
    );
  }

  @Get('counselor/bookings/:bookingId/brief')
  @Roles(Role.COUNSELOR)
  @ApiOperation({ summary: 'Assemble the read-only pre-consultation brief and mark it opened (AC-P1/AC-P7)' })
  getBookingBrief(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId') bookingId: string,
  ): Promise<BookingBrief> {
    return this.consultationService.getBookingBrief(
      user.counselorId!,
      bookingId,
    );
  }

  @Post('counselor/bookings/:bookingId/calls')
  @Roles(Role.COUNSELOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Log a click-to-call attempt as no-show evidence (ADR 0016); never mutates booking status' })
  logCall(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId') bookingId: string,
    @Body() dto: LogCallDto,
  ): Promise<CallLogReceipt> {
    return this.consultationService.logCall(user.counselorId!, bookingId, dto);
  }

  @Patch('counselor/bookings/:bookingId/calls/:callId')
  @Roles(Role.COUNSELOR)
  @ApiOperation({ summary: 'Edit a logged call attempt (correct outcome/note); never mutates booking status (ADR 0016)' })
  updateCallLog(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId') bookingId: string,
    @Param('callId') callId: string,
    @Body() dto: UpdateCallLogDto,
  ): Promise<CallLogReceipt> {
    return this.consultationService.updateCallLog(
      user.counselorId!,
      bookingId,
      callId,
      dto,
    );
  }

  @Delete('counselor/bookings/:bookingId/calls/:callId')
  @Roles(Role.COUNSELOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a logged call attempt; never mutates booking status (ADR 0016)' })
  async deleteCallLog(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId') bookingId: string,
    @Param('callId') callId: string,
  ): Promise<void> {
    await this.consultationService.deleteCallLog(
      user.counselorId!,
      bookingId,
      callId,
    );
  }

  @Get('products')
  @Roles(Role.COUNSELOR)
  @ApiOperation({ summary: 'Return the full product catalog for the record form (AC11)' })
  getProducts(): Promise<ProductCatalogItem[]> {
    return this.consultationService.getProducts();
  }

  @Get('challenges')
  @Roles(Role.COUNSELOR)
  @ApiOperation({ summary: 'Return the challenge catalog for the record form (AC4)' })
  getChallenges(): Promise<ChallengeCatalogItem[]> {
    return this.consultationService.getChallenges();
  }

  @Post('consultation-records')
  @Roles(Role.COUNSELOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a consultation record for an own booking (AC4/AC9)' })
  createRecord(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateConsultationRecordDto,
  ): Promise<ConsultationRecordWithRelations> {
    return this.consultationService.createRecord(user.counselorId!, dto);
  }

  @Patch('consultation-records/:recordId')
  @Roles(Role.COUNSELOR)
  @ApiOperation({ summary: 'Update an existing consultation record on an own booking (AC4/AC9)' })
  updateRecord(
    @CurrentUser() user: AuthenticatedUser,
    @Param('recordId') recordId: string,
    @Body() dto: UpdateConsultationRecordDto,
  ): Promise<ConsultationRecordWithRelations> {
    return this.consultationService.updateRecord(
      user.counselorId!,
      recordId,
      dto,
    );
  }
}
