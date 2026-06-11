import { NextResponse } from 'next/server';
import { getServerToken, verifySession } from '@/shared/auth';

/**
 * GET /api/auth/me  — current-session claims for role-aware UI.
 *
 * Verifies the JWT signature + expiry against JWT_SECRET (not a bare decode),
 * so a tampered or expired cookie yields 401 rather than influencing the UI.
 */
export async function GET() {
  const claims = await verifySession(getServerToken());

  if (!claims) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  return NextResponse.json({
    sub: claims.sub,
    role: claims.role,
    customerId: claims.customerId,
    counselorId: claims.counselorId,
  });
}
