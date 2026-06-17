import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { QaMessage, QaSession, Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import {
  QaAskResult,
  QaService,
  QaSessionWithMessages,
} from './qa.service';
import { CreateQaSessionDto } from './dto/create-qa-session.dto';
import { AskQuestionDto } from './dto/ask-question.dto';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import { QaThrottlerGuard } from './qa-throttler.guard';

/**
 * Customer-facing AI Q&A on test results (ADR 0018). Interpretation-only,
 * grounded on the customer's own metrics. CUSTOMER role only; every handler is
 * additionally ownership/IDOR-guarded in the service (AC9/AC11).
 */
@ApiTags('qa')
@Controller('qa')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER)
export class QaController {
  constructor(private readonly qaService: QaService) {}

  @Post('sessions')
  @UseGuards(QaThrottlerGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Open a Q&A session scoped to a test report (AC1)' })
  createSession(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateQaSessionDto,
  ): Promise<QaSession> {
    return this.qaService.createSession(
      user.customerId as string,
      dto.testResultId,
    );
  }

  @Post('sessions/:id/messages')
  @UseGuards(QaThrottlerGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Ask a free-text question and get a grounded answer (AC2/3/4/5/6)',
  })
  ask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AskQuestionDto,
  ): Promise<QaAskResult> {
    return this.qaService.ask(user.customerId as string, id, dto.question);
  }

  @Get('sessions')
  @ApiOperation({ summary: "List the customer's own Q&A sessions (AC9)" })
  findMySessions(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QaSessionWithMessages[]> {
    return this.qaService.findMySessions(user.customerId as string);
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Get one Q&A session thread (AC9, IDOR-guarded)' })
  findSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<QaSessionWithMessages> {
    return this.qaService.findSession(user.customerId as string, id);
  }

  @Patch('messages/:id/feedback')
  @ApiOperation({ summary: 'Rate an assistant answer YES/NO (AC7)' })
  submitFeedback(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SubmitFeedbackDto,
  ): Promise<QaMessage> {
    return this.qaService.submitFeedback(
      user.customerId as string,
      id,
      dto.feedback,
    );
  }
}
