import { SignJWT } from 'jose';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { verifySession } from './verify';

const SECRET = 'test-secret';
const key = new TextEncoder().encode(SECRET);

beforeAll(() => {
  // verifySession reads process.env.JWT_SECRET at call time.
  process.env.JWT_SECRET = SECRET;
});

/** Mirrors the backend AuthService.login payload. */
function sign(
  claims: Record<string, unknown>,
  opts: { expiresIn?: string; secret?: Uint8Array } = {},
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(opts.expiresIn ?? '1h')
    .sign(opts.secret ?? key);
}

describe('verifySession', () => {
  test('returns typed claims for a valid token', async () => {
    const token = await sign({ sub: 'u1', role: 'CUSTOMER', customerId: 'c1' });
    const claims = await verifySession(token);
    expect(claims).toEqual({
      sub: 'u1',
      role: 'CUSTOMER',
      customerId: 'c1',
      counselorId: undefined,
    });
  });

  test('carries the counselor profile id when present', async () => {
    const token = await sign({ sub: 'u2', role: 'COUNSELOR', counselorId: 'co1' });
    const claims = await verifySession(token);
    expect(claims?.role).toBe('COUNSELOR');
    expect(claims?.counselorId).toBe('co1');
  });

  test('returns null for a missing token', async () => {
    expect(await verifySession(undefined)).toBeNull();
    expect(await verifySession(null)).toBeNull();
    expect(await verifySession('')).toBeNull();
  });

  test('returns null for a tampered signature', async () => {
    const token = await sign(
      { sub: 'u1', role: 'ADMIN' },
      { secret: new TextEncoder().encode('wrong-secret') },
    );
    expect(await verifySession(token)).toBeNull();
  });

  test('returns null for an expired token', async () => {
    const token = await new SignJWT({ sub: 'u1', role: 'ADMIN' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('-1m')
      .sign(key);
    expect(await verifySession(token)).toBeNull();
  });

  test('returns null for an unknown role', async () => {
    const token = await sign({ sub: 'u1', role: 'SUPERADMIN' });
    expect(await verifySession(token)).toBeNull();
  });

  test('returns null when sub is missing', async () => {
    const token = await sign({ role: 'ADMIN' });
    expect(await verifySession(token)).toBeNull();
  });

  test('returns null for a malformed token', async () => {
    expect(await verifySession('not.a.jwt')).toBeNull();
  });

  test('returns null when the exp claim is absent (no never-expiring tokens)', async () => {
    const token = await new SignJWT({ sub: 'u1', role: 'ADMIN' })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(key); // deliberately no setExpirationTime()
    expect(await verifySession(token)).toBeNull();
  });

  test('returns null for a non-HS256 algorithm even when signed with the right secret', async () => {
    const token = await new SignJWT({ sub: 'u1', role: 'ADMIN' })
      .setProtectedHeader({ alg: 'HS512' })
      .setExpirationTime('1h')
      .sign(key);
    expect(await verifySession(token)).toBeNull();
  });

  test('fails closed: a missing JWT_SECRET in production rejects all tokens', async () => {
    const token = await sign({ sub: 'u1', role: 'ADMIN' });
    vi.stubEnv('JWT_SECRET', undefined);
    vi.stubEnv('NODE_ENV', 'production');
    try {
      expect(await verifySession(token)).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
