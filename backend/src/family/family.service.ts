import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FamilyLink, FamilyLinkStatus, Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/** Prisma P2002 unique-violation code (mirrors booking.service.ts pattern). */
const UNIQUE_VIOLATION_CODE = 'P2002';

/** How long an invite code stays PENDING before it expires (24h). */
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

function generateCode(): string {
  return crypto.randomBytes(16).toString('hex');
}

/** Returns [lowId, highId] so (A,B) and (B,A) normalise to the same pair. */
function normalisePair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export interface FamilyLinkWithCounterpart extends FamilyLink {
  /** The other party in the link (not the current caller). */
  counterpart: { id: string; name: string };
  /** Relation label describing how the counterpart relates to the caller. */
  relationLabel: string | null;
}

@Injectable()
export class FamilyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 내 초대 코드 발급 (AC3, AC6).
   *
   * 발급자(customerId)의 활성 PENDING 코드(미만료)가 이미 있으면 그것을 반환.
   * 없으면 24h 만료 코드를 신규 발급.
   */
  async generateInviteCode(customerId: string): Promise<FamilyLink> {
    const existing = await this.prisma.familyLink.findFirst({
      where: {
        inviterCustomerId: customerId,
        status: FamilyLinkStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      return existing;
    }

    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    return this.prisma.familyLink.create({
      data: {
        inviterCustomerId: customerId,
        code: generateCode(),
        status: FamilyLinkStatus.PENDING,
        expiresAt,
      },
    });
  }

  /**
   * 초대 코드 수락 (AC1, AC4, AC5, AC6).
   *
   * $transaction 내에서 상태를 재검증한 뒤 PENDING 행을 ACCEPTED로 UPDATE.
   * ACCEPTED 진입 시 partial unique index(family_link_accepted_pair_unique)가
   * 동일 쌍 중복을 P2002로 차단 → 409 ConflictException.
   * (booking.service.ts insert-first/catch-P2002 패턴과 동일한 접근)
   */
  async acceptInviteCode(
    code: string,
    accepterCustomerId: string,
  ): Promise<FamilyLink> {
    const link = await this.prisma.familyLink.findUnique({ where: { code } });

    if (!link) {
      throw new NotFoundException('초대 코드를 찾을 수 없습니다.');
    }
    if (link.status === FamilyLinkStatus.REVOKED) {
      throw new BadRequestException('이미 해제된 초대 코드입니다.');
    }
    if (link.status === FamilyLinkStatus.ACCEPTED) {
      throw new BadRequestException('이미 수락된 초대 코드입니다.');
    }
    if (link.expiresAt < new Date()) {
      throw new BadRequestException('만료된 초대 코드입니다.');
    }
    if (link.inviterCustomerId === accepterCustomerId) {
      throw new BadRequestException('자기 자신의 초대 코드는 수락할 수 없습니다.');
    }

    const [lowId, highId] = normalisePair(
      link.inviterCustomerId,
      accepterCustomerId,
    );

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Re-check inside the transaction to guard against concurrent accepts.
        const latest = await tx.familyLink.findUnique({ where: { code } });
        if (!latest || latest.status !== FamilyLinkStatus.PENDING) {
          throw new BadRequestException('초대 코드 상태가 변경되었습니다.');
        }
        if (latest.expiresAt < new Date()) {
          throw new BadRequestException('만료된 초대 코드입니다.');
        }

        return tx.familyLink.update({
          where: { id: latest.id },
          data: {
            inviteeCustomerId: accepterCustomerId,
            customerLowId: lowId,
            customerHighId: highId,
            status: FamilyLinkStatus.ACCEPTED,
            acceptedAt: new Date(),
          },
        });
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION_CODE
      ) {
        throw new ConflictException('이미 연동된 가족입니다.');
      }
      throw error;
    }
  }

  /**
   * 내 가족 링크 목록 조회.
   *
   * 발급자 또는 수락자로 참여한 모든 링크를 반환.
   * 상대방 Customer {id, name}과 나에게 적용되는 관계 라벨을 포함.
   * (실제 검사 결과 접근 권한은 test-result.service의 findForCustomer에서 강제.)
   */
  async listLinks(customerId: string): Promise<FamilyLinkWithCounterpart[]> {
    const links = await this.prisma.familyLink.findMany({
      where: {
        OR: [
          { inviterCustomerId: customerId },
          { inviteeCustomerId: customerId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        inviter: { select: { id: true, name: true } },
        invitee: { select: { id: true, name: true } },
      },
    });

    return links.map((link) => {
      const isInviter = link.inviterCustomerId === customerId;
      const counterpart = isInviter
        ? (link.invitee ?? { id: '', name: '(알 수 없음)' })
        : link.inviter;

      // 나의 방향에서 상대방이 나에게 갖는 관계 라벨.
      // 내가 low이면 상대(high)→나에게 적용되는 라벨 = relationHighToLow.
      // 내가 high이면 상대(low)→나에게 적용되는 라벨 = relationLowToHigh.
      let relationLabel: string | null = null;
      if (link.customerLowId && link.customerHighId) {
        relationLabel =
          link.customerLowId === customerId
            ? link.relationHighToLow
            : link.relationLowToHigh;
      }

      const { inviter: _i, invitee: _v, ...linkBase } = link;
      return { ...linkBase, counterpart, relationLabel };
    });
  }

  /**
   * 연동 상대에 대한 관계 라벨 설정 (사용자 직접 지정).
   *
   * 호출자 기준으로 "상대방이 나에게 어떤 사람인지"를 자유 텍스트로 저장한다.
   * 내가 low이면 relationHighToLow를, high이면 relationLowToHigh를 갱신한다.
   * 빈 문자열이면 라벨을 제거(null)한다. ACCEPTED 링크에서만 설정 가능.
   */
  async setRelationLabel(
    customerId: string,
    linkId: string,
    relation: string,
  ): Promise<FamilyLink> {
    const link = await this.prisma.familyLink.findUnique({
      where: { id: linkId },
    });

    if (
      !link ||
      (link.inviterCustomerId !== customerId &&
        link.inviteeCustomerId !== customerId)
    ) {
      throw new ForbiddenException('해당 링크에 대한 권한이 없습니다.');
    }
    if (
      link.status !== FamilyLinkStatus.ACCEPTED ||
      !link.customerLowId ||
      !link.customerHighId
    ) {
      throw new BadRequestException('연동이 완료된 후에 관계를 설정할 수 있습니다.');
    }

    const trimmed = relation.trim();
    const value = trimmed.length > 0 ? trimmed : null;

    const data: Prisma.FamilyLinkUpdateInput =
      link.customerLowId === customerId
        ? { relationHighToLow: value }
        : { relationLowToHigh: value };

    return this.prisma.familyLink.update({ where: { id: linkId }, data });
  }

  /**
   * 가족 링크 해제 (AC7, AC8).
   *
   * 발급자 또는 수락자 누구나 자신이 참여한 링크를 해제할 수 있음.
   * REVOKE 즉시 findForCustomer가 라이브로 ACCEPTED 링크만 보므로 상대 결과가 차단됨.
   */
  async revokeLink(customerId: string, linkId: string): Promise<FamilyLink> {
    const link = await this.prisma.familyLink.findUnique({
      where: { id: linkId },
    });

    if (
      !link ||
      (link.inviterCustomerId !== customerId &&
        link.inviteeCustomerId !== customerId)
    ) {
      throw new ForbiddenException('해당 링크에 대한 권한이 없습니다.');
    }
    if (link.status === FamilyLinkStatus.REVOKED) {
      throw new BadRequestException('이미 해제된 링크입니다.');
    }

    return this.prisma.familyLink.update({
      where: { id: linkId },
      data: { status: FamilyLinkStatus.REVOKED },
    });
  }
}
