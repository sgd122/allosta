import { pfetch } from '@/shared/api';
import type { CurrentUser, CustomerProfile } from '../types';

/** Reads current user from the session cookie via /api/auth/me (no token leak). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const res = await fetch('/api/auth/me');
  if (!res.ok) return null;
  return res.json() as Promise<CurrentUser>;
}

export async function getMe(): Promise<CustomerProfile> {
  return pfetch<CustomerProfile>('me');
}
