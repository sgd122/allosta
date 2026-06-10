import { Injectable } from '@nestjs/common';
import { FamilyLinkStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface FamilyMemberDto {
  id: string;
  name: string;
  relation: string;
}

export interface CustomerProfileDto {
  customerId: string;
  name: string;
  phone: string;
}

@Injectable()
export class CustomerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns ACCEPTED FamilyLink partners for the given customer.
   * Replaces the old FamilyMember-based approach after symmetric redesign.
   * Used by the FE subject selector to show linked family accounts.
   */
  async getFamilyMembers(customerId: string): Promise<FamilyMemberDto[]> {
    const acceptedLinks = await this.prisma.familyLink.findMany({
      where: {
        status: FamilyLinkStatus.ACCEPTED,
        OR: [
          { inviterCustomerId: customerId },
          { inviteeCustomerId: customerId },
        ],
      },
      include: {
        inviter: { select: { id: true, name: true } },
        invitee: { select: { id: true, name: true } },
      },
    });

    return acceptedLinks.map((link) => {
      const isInviter = link.inviterCustomerId === customerId;
      // For ACCEPTED links inviteeCustomerId is always set (non-null).
      const partner = isInviter ? link.invitee! : link.inviter;
      // "what is partner to me": if I'm Low, partner is High → use relationLowToHigh
      //                          if I'm High, partner is Low → use relationHighToLow
      const amLow = link.customerLowId === customerId;
      const relation = amLow
        ? (link.relationLowToHigh ?? '가족')
        : (link.relationHighToLow ?? '가족');
      return {
        id: partner.id,
        name: partner.name,
        relation,
      };
    });
  }

  /**
   * Returns minimal profile for the current customer.
   */
  async getProfile(customerId: string): Promise<CustomerProfileDto | null> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true, phone: true },
    });

    if (!customer) {
      return null;
    }

    return {
      customerId: customer.id,
      name: customer.name,
      phone: customer.phone,
    };
  }
}
