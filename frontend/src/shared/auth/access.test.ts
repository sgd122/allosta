import { describe, expect, test } from 'vitest';
import { requiredRoleForPath, homePathForRole, ROUTE_ROLES } from './access';

describe('requiredRoleForPath', () => {
  test('maps each protected prefix to its owning role', () => {
    expect(requiredRoleForPath('/dashboard')).toBe('ADMIN');
    expect(requiredRoleForPath('/schedule')).toBe('COUNSELOR');
    expect(requiredRoleForPath('/performance')).toBe('COUNSELOR');
    expect(requiredRoleForPath('/availability')).toBe('COUNSELOR');
    expect(requiredRoleForPath('/book')).toBe('CUSTOMER');
    expect(requiredRoleForPath('/bookings')).toBe('CUSTOMER');
    expect(requiredRoleForPath('/results')).toBe('CUSTOMER');
  });

  test('matches nested sub-paths of a protected prefix', () => {
    expect(requiredRoleForPath('/dashboard/metrics')).toBe('ADMIN');
    expect(requiredRoleForPath('/bookings/abc123')).toBe('CUSTOMER');
  });

  test('does not treat a prefix collision as a match', () => {
    // '/booking' must NOT match the '/book' prefix.
    expect(requiredRoleForPath('/booking')).toBeNull();
    expect(requiredRoleForPath('/bookshelf')).toBeNull();
  });

  test('returns null for public paths', () => {
    expect(requiredRoleForPath('/')).toBeNull();
    expect(requiredRoleForPath('/login')).toBeNull();
    expect(requiredRoleForPath('/api/auth/me')).toBeNull();
  });
});

describe('homePathForRole', () => {
  test('returns the landing route for each role', () => {
    expect(homePathForRole('ADMIN')).toBe('/dashboard');
    expect(homePathForRole('COUNSELOR')).toBe('/schedule');
    expect(homePathForRole('CUSTOMER')).toBe('/book');
  });

  // Guards against an infinite redirect loop: the middleware sends a wrong-role
  // user to homePathForRole(role); if that target were not gated to the same
  // role, it would bounce forever. Every home must round-trip to its own role.
  test('every role home is gated to that same role (no redirect loop)', () => {
    for (const role of Object.keys(ROUTE_ROLES) as Array<keyof typeof ROUTE_ROLES>) {
      expect(requiredRoleForPath(homePathForRole(role))).toBe(role);
    }
  });
});
