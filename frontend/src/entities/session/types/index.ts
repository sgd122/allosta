import type { Role } from '@/shared/config';

/** Verified JWT claims returned by /api/auth/me (signature + expiry checked server-side). */
export interface CurrentUser {
  sub: string;
  role: Role;
  customerId?: string;
  counselorId?: string;
}

/** Shape returned by POST /api/auth/login. */
export interface LoginResponse {
  role: Role;
  customerId?: string;
  counselorId?: string;
}

export interface CustomerProfile {
  customerId: string;
  name: string;
  phone: string;
}
