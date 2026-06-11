/**
 * Server-side access control (runs on the Edge before any page renders).
 *
 * Protected route groups — (admin)/(counselor)/(customer) — are statically
 * pre-rendered client shells. Without this gate they answer 200 to anyone, so
 * authorization would rest entirely on the backend API. This middleware closes
 * that gap: it verifies the session JWT (signature + expiry) and the role for
 * the requested path BEFORE the shell is served.
 *
 *   - no / invalid / expired cookie  → redirect to /login (and clear the cookie)
 *   - valid cookie, wrong role       → redirect to that user's own home
 *   - valid cookie, correct role     → continue
 *
 * Only protected prefixes are matched (see `config.matcher`); /login, /, the
 * API routes, and static assets are untouched.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/shared/auth/cookie';
import { verifySession } from '@/shared/auth/verify';
import { requiredRoleForPath, homePathForRole } from '@/shared/auth/access';

function redirectTo(request: NextRequest, pathname: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = '';
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const requiredRole = requiredRoleForPath(request.nextUrl.pathname);

  // Public path (matcher shouldn't route it here, but stay defensive).
  if (!requiredRole) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const claims = await verifySession(token);

  if (!claims) {
    const response = redirectTo(request, '/login');
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  if (claims.role !== requiredRole) {
    return redirectTo(request, homePathForRole(claims.role));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/schedule/:path*',
    '/performance/:path*',
    '/availability/:path*',
    '/book/:path*',
    '/bookings/:path*',
    '/results/:path*',
  ],
};
