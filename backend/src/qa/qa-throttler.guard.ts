import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limits the QA write endpoints PER AUTHENTICATED CUSTOMER rather than per
 * IP (ADR 0018 security hardening). The in-flight cap in QaService protects the
 * single local LLM from pile-up, but it does NOT bound row creation — without
 * this an authenticated customer could spam POST /qa/sessions and /messages and
 * grow the table unbounded. Keying on customerId (not IP) is both the correct
 * abuse boundary for a logged-in API (shared NAT/proxy IPs must not throttle
 * unrelated customers) and what keeps the e2e suite — many distinct seeded
 * customers behind one loopback IP — free of cross-spec bucket collisions.
 *
 * The class-level JwtAuthGuard on QaController runs before this route-level
 * guard, so `req.user` is always populated here. The IP fallback only applies if
 * an unauthenticated request somehow reaches a throttled handler.
 */
@Injectable()
export class QaThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const customerId = req.user?.customerId as string | undefined;
    return customerId ?? req.ip;
  }
}
