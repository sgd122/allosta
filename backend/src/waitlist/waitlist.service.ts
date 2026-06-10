import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  Prisma,
  SubjectType,
  Waitlist,
  WaitlistStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/ownership/ownership.service';

const DEFAULT_WAITLIST_OFFER_TTL_MINUTES = 30;
const MS_PER_MINUTE = 60_000;

/**
 * Waitlist domain (R4 / AC10 / AC-W2..W5):
 * - Registration (WAITING)
 * - Advisory offer on cancellation (NOTIFIED + offeredSlotId + offerExpiresAt)
 * - TTL sweep (NOTIFIED past TTL → EXPIRED, re-promote next WAITING)
 * - Conversion on booking (NOTIFIED + matching predicate → CONVERTED)
 *
 * The offer is ADVISORY: it confers no booking priority and does not hide or
 * hold the slot. A non-waitlisted customer may still book it first; the
 * booking_slot_active_unique index is the sole arbiter. `convertOnBooking`
 * only converts the NOTIFIED row; EXPIRED rows are not touched.
 */
@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Registers the current customer on a counselor's waitlist (AC10).
   * Verifies subject ownership (AC7b) before creating the WAITING row.
   */
  async create(
    customerId: string,
    counselorId: string,
    subjectType: SubjectType,
    subjectId: string,
  ): Promise<Waitlist> {
    await this.ownership.assertSubjectOwnedByCustomer(
      customerId,
      subjectType,
      subjectId,
    );

    return this.prisma.waitlist.create({
      data: {
        customerId,
        counselorId,
        subjectType,
        subjectId,
        status: WaitlistStatus.WAITING,
      },
    });
  }

  /**
   * Promotes the oldest WAITING entry for a counselor when a slot opens via
   * cancellation (AC10/AC-W2, FIFO). Sets NOTIFIED + offeredSlotId + offerExpiresAt
   * and creates a SLOT_OPENED notification. Runs inside the caller's cancellation
   * transaction so the whole cancel + promote + notify sequence is atomic.
   *
   * The offer is ADVISORY — it confers no booking priority; a non-waitlisted
   * customer may still book the freed slot. No-op if nobody is waiting.
   */
  async promoteOnCancellation(
    counselorId: string,
    slotId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const next = await tx.waitlist.findFirst({
      where: { counselorId, status: WaitlistStatus.WAITING },
      orderBy: { createdAt: 'asc' },
    });

    if (!next) {
      return;
    }

    const offerExpiresAt = new Date(
      Date.now() + this.offerTtlMinutes() * MS_PER_MINUTE,
    );

    await tx.waitlist.update({
      where: { id: next.id },
      data: {
        status: WaitlistStatus.NOTIFIED,
        offeredSlotId: slotId,
        offerExpiresAt,
      },
    });

    await tx.notification.create({
      data: {
        waitlistId: next.id,
        type: NotificationType.SLOT_OPENED,
        channel: NotificationChannel.IN_APP,
        status: NotificationStatus.PENDING,
      },
    });
  }

  /**
   * Expires NOTIFIED offers past their TTL and re-promotes the next waiter
   * UNCONDITIONALLY (AC-W3, advisory-by-construction).
   *
   * For each expired row, the next WAITING entry for that counselor receives
   * the same offeredSlotId + a fresh TTL + SLOT_OPENED notification. There is
   * NO "iff slot still open" check-then-act gate — the booking insert-first path
   * is the sole arbiter. No-op per counselor if no next waiter.
   *
   * Returns the number of rows expired.
   */
  async sweepWaitlistOffers(): Promise<number> {
    const now = new Date();

    const expiredRows = await this.prisma.waitlist.findMany({
      where: {
        status: WaitlistStatus.NOTIFIED,
        offerExpiresAt: { lt: now },
      },
      select: { id: true, counselorId: true, offeredSlotId: true },
    });

    if (expiredRows.length === 0) {
      return 0;
    }

    let promoted = 0;

    for (const row of expiredRows) {
      // Mark expired
      await this.prisma.waitlist.update({
        where: { id: row.id },
        data: { status: WaitlistStatus.EXPIRED },
      });

      // Re-promote next WAITING unconditionally (no slot-state gate)
      const next = await this.prisma.waitlist.findFirst({
        where: {
          counselorId: row.counselorId,
          status: WaitlistStatus.WAITING,
        },
        orderBy: { createdAt: 'asc' },
      });

      if (next) {
        const offerExpiresAt = new Date(
          Date.now() + this.offerTtlMinutes() * MS_PER_MINUTE,
        );

        await this.prisma.waitlist.update({
          where: { id: next.id },
          data: {
            status: WaitlistStatus.NOTIFIED,
            offeredSlotId: row.offeredSlotId,
            offerExpiresAt,
          },
        });

        await this.prisma.notification.create({
          data: {
            waitlistId: next.id,
            type: NotificationType.SLOT_OPENED,
            channel: NotificationChannel.IN_APP,
            status: NotificationStatus.PENDING,
          },
        });

        promoted += 1;
      }
    }

    if (expiredRows.length > 0) {
      this.logger.log(
        `sweepWaitlistOffers: ${expiredRows.length} expired, ${promoted} re-promoted`,
      );
    }

    return expiredRows.length;
  }

  /**
   * Converts the booker's NOTIFIED waitlist row when they book the offered slot
   * (AC-W4). Must run inside the booking creation transaction to be atomic.
   *
   * Predicate (exact match required, per AC-W4):
   *   customerId = booker AND counselorId = slot.counselorId
   *   AND offeredSlotId = booked slotId AND status = NOTIFIED
   *
   * An EXPIRED offer does NOT convert — NOTIFIED is the only converting state.
   * Subject is not part of the predicate; the slot binding disambiguates.
   */
  async convertOnBooking(
    tx: Prisma.TransactionClient,
    customerId: string,
    counselorId: string,
    slotId: string,
  ): Promise<void> {
    await tx.waitlist.updateMany({
      where: {
        customerId,
        counselorId,
        offeredSlotId: slotId,
        status: WaitlistStatus.NOTIFIED,
      },
      data: { status: WaitlistStatus.CONVERTED },
    });
  }

  /**
   * Lists all waitlist entries for a customer, ordered newest-first.
   * Includes the offered slot window when present (NOTIFIED state).
   */
  async findByCustomer(customerId: string): Promise<
    (Waitlist & {
      offeredSlot: { id: string; startAt: Date; endAt: Date } | null;
    })[]
  > {
    return this.prisma.waitlist.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: {
        offeredSlot: { select: { id: true, startAt: true, endAt: true } },
      },
    });
  }

  private offerTtlMinutes(): number {
    const raw = this.config.get<string>('WAITLIST_OFFER_TTL_MINUTES');
    const parsed = raw !== undefined ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : DEFAULT_WAITLIST_OFFER_TTL_MINUTES;
  }
}
