import { ForbiddenException, Injectable } from '@nestjs/common';
import { FamilyLinkStatus, SubjectType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Resource-ownership layer — the SECOND authorization layer, distinct
 * from role-based access (RolesGuard).
 *
 * RBAC answers "may this ROLE call this endpoint?"; this service answers
 * "does this specific resource belong to this specific user?". Feature modules
 * (booking, consultation, waitlist) inject it via the @Global CommonModule.
 */
@Injectable()
export class OwnershipService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ensures the (subjectType, subjectId) pair is bookable by `customerId`.
   *
   * A CUSTOMER subject is allowed when it is either:
   *   (a) the customer themselves (subjectId === customerId), or
   *   (b) a customer directly linked via an ACCEPTED FamilyLink.
   *
   * This MUST mirror `TestResultService.findForCustomer` (the candidate list the
   * UI shows): if a family member's test result is offered for booking, booking
   * it must not 403. One-hop only, live (no caching) — REVOKE takes effect
   * immediately. Any non-CUSTOMER subjectType is rejected.
   */
  async assertSubjectOwnedByCustomer(
    customerId: string,
    subjectType: SubjectType,
    subjectId: string,
  ): Promise<void> {
    if (subjectType !== SubjectType.CUSTOMER) {
      throw new ForbiddenException(
        'Subject does not belong to the current customer',
      );
    }

    if (subjectId === customerId) {
      return;
    }

    // Allow when an ACCEPTED family link directly connects the two customers
    // (either direction). Matches the test-result visibility query.
    const link = await this.prisma.familyLink.findFirst({
      where: {
        status: FamilyLinkStatus.ACCEPTED,
        OR: [
          { inviterCustomerId: customerId, inviteeCustomerId: subjectId },
          { inviterCustomerId: subjectId, inviteeCustomerId: customerId },
        ],
      },
      select: { id: true },
    });

    if (!link) {
      throw new ForbiddenException(
        'Subject does not belong to the current customer',
      );
    }
  }

  /**
   * Ensures `bookingId` belongs to a slot owned by `counselorId`, so a
   * counselor can only attach a ConsultationRecord to their own bookings (AC4).
   */
  async assertBookingOwnedByCounselor(
    counselorId: string,
    bookingId: string,
  ): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { slot: { select: { counselorId: true } } },
    });

    if (!booking || booking.slot.counselorId !== counselorId) {
      throw new ForbiddenException(
        'Booking is not assigned to the current counselor',
      );
    }
  }
}
