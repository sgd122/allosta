/**
 * Server-side JWT verification.
 *
 * Unlike a bare base64 payload decode, this VERIFIES the HS256 signature and
 * the `exp` claim against the same `JWT_SECRET` the NestJS backend signs with.
 * A tampered or expired cookie therefore fails here — so it is safe to use the
 * returned claims for routing AND authorization decisions (middleware gates).
 *
 * `jose` is used (not `jsonwebtoken`) because it runs in the Edge runtime,
 * which is where Next.js middleware executes.
 *
 * No `server-only` / `next/headers` imports here: this module must be importable
 * from middleware (Edge), Route Handlers, and Server Components alike.
 */
import { jwtVerify } from 'jose';
import type { Role } from '@/shared/config';

/** Claims carried by the NestJS-issued JWT (see backend AuthService.login). */
export interface SessionClaims {
  sub: string;
  role: Role;
  customerId?: string;
  counselorId?: string;
}

const VALID_ROLES: readonly Role[] = ['CUSTOMER', 'COUNSELOR', 'ADMIN'];

/**
 * Dev-only fallback secret. MUST stay byte-identical to the backend fallback
 * (`backend/src/auth/auth.module.ts`, `jwt.strategy.ts`) and to the
 * `.env.example` file on each side — otherwise the frontend verifies with a
 * different key than the backend signs with and every token silently fails
 * (endless /login bounce). One documented value, no second default to drift from.
 */
const DEV_FALLBACK_SECRET = 'dev-only-change-me-in-production';

/**
 * Resolves the HMAC secret. Fails closed in production: a missing `JWT_SECRET`
 * there throws (caught by `verifySession`, so all tokens are treated as invalid)
 * rather than silently trusting a well-known default that anyone could forge with.
 */
function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be set in production');
    }
    return new TextEncoder().encode(DEV_FALLBACK_SECRET);
  }
  return new TextEncoder().encode(secret);
}

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && VALID_ROLES.includes(value as Role);
}

/**
 * Verifies the JWT signature + expiry and returns typed claims, or `null` when
 * the token is missing/malformed/tampered/expired or carries an unknown role.
 * Never throws.
 */
export async function verifySession(token: string | undefined | null): Promise<SessionClaims | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ['HS256'],
      requiredClaims: ['exp'],
    });

    if (typeof payload.sub !== 'string' || !isRole(payload.role)) {
      return null;
    }

    return {
      sub: payload.sub,
      role: payload.role,
      customerId: typeof payload.customerId === 'string' ? payload.customerId : undefined,
      counselorId: typeof payload.counselorId === 'string' ? payload.counselorId : undefined,
    };
  } catch {
    return null;
  }
}
