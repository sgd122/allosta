import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/shared/auth';

/**
 * POST /api/auth/logout
 *
 * Clears the session cookie. The NestJS JWT becomes unreachable by the client.
 */
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
