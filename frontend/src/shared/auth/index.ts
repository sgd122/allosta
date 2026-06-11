import 'server-only';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from './cookie';

export { SESSION_COOKIE } from './cookie';
export { verifySession, type SessionClaims } from './verify';
export { requiredRoleForPath, homePathForRole, ROUTE_ROLES } from './access';

/** Reads the JWT from the httpOnly session cookie (server-side only). */
export function getServerToken(): string | null {
  return cookies().get(SESSION_COOKIE)?.value ?? null;
}

/**
 * Returns Authorization headers for NestJS calls from Server Components
 * or Route Handlers. Returns an empty object when unauthenticated.
 */
export function getServerAuthHeaders(): Record<string, string> {
  const token = getServerToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
