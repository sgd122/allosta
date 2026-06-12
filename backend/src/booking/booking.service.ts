import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Booking,
  BookingStatus,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  Prisma,
  SubjectType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/ownership/ownership.service';

const DEFAULT_REMINDER_LEAD_MINUTES = 30;
const MS_PER_MINUTE = 60_000;
const UNIQUE_VIOLATION_CODE = 'P2002';

/**
 * Shape returned by GET /bookings — the customer's own bookings with the
 * booked slot window and the originating test result's service type (AC9/AC10).
 */
export interface MyBookingDto {
  id: string;
  status: BookingStatus;
  slot: { startAt: Date; endAt: Date };
  subjectType: SubjectType;
  subjectId: string;
  testResultId: string | null;
  serviceType: string | null;
}

/**
 * Booking domain: confirmation, concurrency-safe creation (AC2), cancellation
 * (frees the slot, no promotion), and ops lifecycle sweeps (AC-N3/N4/N6).
 */
@Injectable()
export class BookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Creates a PENDING booking for a slot (AC1/AC2/AC3/AC8/AC11).
   *
   * Concurrency is handled DB-side via the partial unique index
   * `booking_slot_active_unique`. Insert-first / catch-P2002 pattern avoids
   * TOCTOU. Confirmation + reminder notifications are created in the same
   * transaction.
   */
  async create(
    customerId: string,
    slotId: string,
    testResultId: string,
    concern?: string,
  ): Promise<Booking> {
    const testResult = await this.prisma.testResult.findUnique({
      where: { id: testResultId },
      select: { subjectType: true, subjectId: true },
    });

    if (!testResult) {
      throw new NotFoundException('Test result not found');
    }

    const subjectType = testResult.subjectType;
    const subjectId = testResult.subjectId;

    await this.ownership.assertSubjectOwnedByCustomer(
      customerId,
      subjectType,
      subjectId,
    );

    const slot = await this.prisma.availabilitySlot.findUnique({
      where: { id: slotId },
      select: {
        id: true,
        isOpen: true,
        startAt: true,
        endAt: true,
        counselorId: true,
      },
    });

    if (!slot) {
      throw new NotFoundException('Slot not found');
    }
    if (!slot.isOpen) {
      throw new ConflictException('Slot is not open for booking');
    }

    const reminderAt = new Date(
      slot.startAt.getTime() - this.reminderLeadMinutes() * MS_PER_MINUTE,
    );

    try {
      return await this.prisma.$transaction(async (tx) => {
        const booking = await tx.booking.create({
          data: {
            slotId,
            customerId,
            subjectType,
            subjectId,
            testResultId,
            status: BookingStatus.PENDING,
            ...(concern !== undefined && { concern }),
          },
        });

        await tx.notification.create({
          data: {
            bookingId: booking.id,
            type: NotificationType.CONFIRMATION,
            channel: NotificationChannel.IN_APP,
            status: NotificationStatus.PENDING,
            scheduledAt: null,
          },
        });

        await tx.notification.create({
          data: {
            bookingId: booking.id,
            type: NotificationType.REMINDER,
            channel: NotificationChannel.CONSOLE,
            status: NotificationStatus.PENDING,
            scheduledAt: reminderAt,
          },
        });

        return booking;
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION_CODE
      ) {
        throw new ConflictException('Slot is already booked');
      }
      throw error;
    }
  }

  /**
   * derived-available again. There is no waitlist promotion.
   */
  async cancel(customerId: string, bookingId: string): Promise<Booking> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        slotId: true,
        customerId: true,
        status: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (booking.customerId !== customerId) {
      throw new ForbiddenException(
        'Booking does not belong to the current customer',
      );
    }
    // Only an ACTIVE booking can be cancelled. Re-cancelling a CANCELLED or
    // reverting a COMPLETED/NO_SHOW booking would corrupt status history —
    // reject with 409. A normal cancel of a PENDING/CONFIRMED booking succeeds.
    if (
      booking.status !== BookingStatus.PENDING &&
      booking.status !== BookingStatus.CONFIRMED
    ) {
      throw new ConflictException('Only an active booking can be cancelled');
    }

    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.CANCELLED },
    });
  }

  /**
   * Lists the current customer's bookings, ordered by slot start time ascending,
   * with the booked window and originating test result's service type (AC9/AC10).
   */
  async findMyBookings(customerId: string): Promise<MyBookingDto[]> {
    const bookings = await this.prisma.booking.findMany({
      where: { customerId },
      orderBy: { slot: { startAt: 'asc' } },
      select: {
        id: true,
        status: true,
        subjectType: true,
        subjectId: true,
        testResultId: true,
        slot: { select: { startAt: true, endAt: true } },
        testResult: { select: { serviceType: true } },
      },
    });

    return bookings.map((b) => ({
      id: b.id,
      status: b.status,
      slot: { startAt: b.slot.startAt, endAt: b.slot.endAt },
      subjectType: b.subjectType,
      subjectId: b.subjectId,
      testResultId: b.testResultId,
      serviceType: b.testResult?.serviceType ?? null,
    }));
  }

  /**
   * Confirms a PENDING booking on behalf of the counselor who owns the slot
   * (AC12). Ownership is asserted first. Only PENDING bookings can be confirmed.
   */
  async confirm(counselorId: string, bookingId: string): Promise<Booking> {
    await this.ownership.assertBookingOwnedByCounselor(counselorId, bookingId);

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { status: true },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (booking.status !== BookingStatus.PENDING) {
      throw new ConflictException('Booking is not pending');
    }

    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.CONFIRMED },
    });
  }

  // ── Ops-hardening domain methods (AC-N3/N4/N6) ───────────────────────────
  // Thin timing-only OpsScheduler calls these directly. Tests also call them
  // directly — never via the live @Interval (plan §Principle 5).

  /**
   * Status-guarded sweep: marks past, confirmed, unrecorded bookings NO_SHOW.
   *
   * Predicate: status=CONFIRMED AND slot.endAt < now AND record IS NULL.
   * A concurrently-committed COMPLETED (via createRecord) wins — the guard
   * excludes it. Never touches PENDING/CANCELLED/COMPLETED/NO_SHOW (AC-N3).
   *
   * Returns the number of rows transitioned.
   */
  async sweepNoShows(): Promise<number> {
    const now = new Date();
    const result = await this.prisma.booking.updateMany({
      where: {
        status: BookingStatus.CONFIRMED,
        slot: { endAt: { lt: now } },
        record: { is: null },
      },
      data: { status: BookingStatus.NO_SHOW },
    });
    return result.count;
  }

  /**
   * Disposes of stale PENDING bookings whose slot has already ended (AC-N6).
   *
   * Predicate: status=PENDING AND slot.endAt < now → CANCELLED.
   * Frees each slot from the booking_slot_active_unique partial index.
   *
   * Returns the number of rows transitioned.
   */
  async sweepStalePending(): Promise<number> {
    const now = new Date();
    const result = await this.prisma.booking.updateMany({
      where: {
        status: BookingStatus.PENDING,
        slot: { endAt: { lt: now } },
      },
      data: { status: BookingStatus.CANCELLED },
    });
    return result.count;
  }

  /**
   * Counselor manual attendance override (AC-N4).
   *
   * Sets the booking to NO_SHOW or COMPLETED in either direction. A record is
   * NOT required — the counselor may mark a session COMPLETED without one.
   * Ownership is asserted first (403 if the booking is not on this counselor's
   * slot).
   */
  async setAttendance(
    counselorId: string,
    bookingId: string,
    status: BookingStatus,
  ): Promise<Booking> {
    await this.ownership.assertBookingOwnedByCounselor(counselorId, bookingId);

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { status },
    });
  }

  private reminderLeadMinutes(): number {
    const raw = this.config.get<string>('REMINDER_LEAD_MINUTES');
    const parsed = raw !== undefined ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : DEFAULT_REMINDER_LEAD_MINUTES;
  }
}
