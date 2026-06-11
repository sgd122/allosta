/**
 * Route → role access policy (single source of truth).
 *
 * Pure functions, no framework imports — shared by `middleware.ts` (the server
 * gate) and unit tests. Keep this in sync with the route groups under
 * `src/app/(admin|counselor|customer)/`.
 */
import type { Role } from '@/shared/config';

/** Path prefixes each role is allowed to reach. */
export const ROUTE_ROLES: Record<Role, readonly string[]> = {
  ADMIN: ['/dashboard'],
  COUNSELOR: ['/schedule', '/performance', '/availability'],
  CUSTOMER: ['/book', '/bookings', '/results'],
};

const ROLE_ORDER: readonly Role[] = ['ADMIN', 'COUNSELOR', 'CUSTOMER'];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * The role required to access `pathname`, or `null` when the path is public
 * (not owned by any protected route group).
 */
export function requiredRoleForPath(pathname: string): Role | null {
  for (const role of ROLE_ORDER) {
    if (ROUTE_ROLES[role].some((prefix) => matchesPrefix(pathname, prefix))) {
      return role;
    }
  }
  return null;
}

/** The landing route for a signed-in user of the given role. */
export function homePathForRole(role: Role): string {
  switch (role) {
    case 'ADMIN':
      return '/dashboard';
    case 'COUNSELOR':
      return '/schedule';
    case 'CUSTOMER':
      return '/book';
  }
}
