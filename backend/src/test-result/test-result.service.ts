import { Injectable } from '@nestjs/common';
import { FamilyLinkStatus, SubjectType, TestResult } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface TestResultDto {
  id: string;
  subjectType: SubjectType;
  subjectId: string;
  serviceType: string;
  metrics: unknown;
  createdAt: Date;
}

@Injectable()
export class TestResultService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns all CUSTOMER TestResults visible to this customer:
   *   (a) their own results (subjectId = customerId), and
   *   (b) results of every Customer directly linked via an ACCEPTED FamilyLink.
   *
   * ONE-HOP ONLY — no transitive exposure (AC10): only direct links from
   * customerId are used; linked partners' own links are ignored.
   *
   * Live computation — no caching (AC8): REVOKE takes effect immediately
   * because the ACCEPTED-link query runs on every request.
   */
  async findForCustomer(customerId: string): Promise<TestResultDto[]> {
    // Live query — returns only ACCEPTED links directly touching this customer.
    const acceptedLinks = await this.prisma.familyLink.findMany({
      where: {
        status: FamilyLinkStatus.ACCEPTED,
        OR: [
          { inviterCustomerId: customerId },
          { inviteeCustomerId: customerId },
        ],
      },
      select: {
        inviterCustomerId: true,
        inviteeCustomerId: true,
      },
    });

    // Extract the partner's id from each link (the "other" end).
    const linkedCustomerIds: string[] = acceptedLinks.flatMap((link) => {
      if (link.inviterCustomerId === customerId) {
        return link.inviteeCustomerId ? [link.inviteeCustomerId] : [];
      }
      return [link.inviterCustomerId];
    });

    const results: TestResult[] = await this.prisma.testResult.findMany({
      where: {
        subjectType: SubjectType.CUSTOMER,
        subjectId: { in: [customerId, ...linkedCustomerIds] },
      },
      orderBy: { createdAt: 'desc' },
    });

    return results.map((r) => ({
      id: r.id,
      subjectType: r.subjectType,
      subjectId: r.subjectId,
      serviceType: r.serviceType,
      metrics: r.metrics,
      createdAt: r.createdAt,
    }));
  }
}
