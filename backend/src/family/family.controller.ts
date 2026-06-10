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
import { FamilyLink, Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { FamilyService, FamilyLinkWithCounterpart } from './family.service';
import { SetRelationDto } from './dto/set-relation.dto';

@ApiTags('family')
@Controller('family')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER)
export class FamilyController {
  constructor(private readonly familyService: FamilyService) {}

  /**
   * 내 초대 코드 발급 (AC3, AC6).
   * 활성 PENDING 코드가 이미 있으면 그것을 반환, 없으면 신규 발급.
   * Body 불필요 — 발급자는 JWT의 customerId로 결정.
   */
  @Post('invite-codes')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '내 초대 코드 발급 (재발급 시 기존 코드 반환)' })
  generateInviteCode(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FamilyLink> {
    return this.familyService.generateInviteCode(user.customerId as string);
  }

  /**
   * 초대 코드 수락 (AC1, AC4, AC5).
   * 수락자는 JWT의 customerId로 결정.
   */
  @Post('invite-codes/:code/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '초대 코드 수락' })
  acceptInviteCode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
  ): Promise<FamilyLink> {
    return this.familyService.acceptInviteCode(code, user.customerId as string);
  }

  /**
   * 내 가족 링크 목록 조회 (발급자 + 수락자 양쪽 포함).
   * 상대방 이름과 관계 라벨을 포함하여 반환.
   */
  @Get('links')
  @ApiOperation({ summary: '내 가족 링크 목록 조회' })
  listLinks(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FamilyLinkWithCounterpart[]> {
    return this.familyService.listLinks(user.customerId as string);
  }

  /**
   * 연동 상대에 대한 관계 라벨 설정 (사용자 직접 지정).
   * 호출자 기준으로 상대를 부르는 라벨을 저장. ACCEPTED 링크에서만 가능.
   */
  @Patch('links/:id/relation')
  @ApiOperation({ summary: '연동 상대 관계 라벨 설정' })
  setRelationLabel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetRelationDto,
  ): Promise<FamilyLink> {
    return this.familyService.setRelationLabel(
      user.customerId as string,
      id,
      dto.relation,
    );
  }

  /**
   * 연동 해제 (AC8).
   * 발급자 또는 수락자 누구나 해제 가능.
   */
  @Delete('links/:id')
  @ApiOperation({ summary: '가족 링크 해제' })
  revokeLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<FamilyLink> {
    return this.familyService.revokeLink(user.customerId as string, id);
  }
}
