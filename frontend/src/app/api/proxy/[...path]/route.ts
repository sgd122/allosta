/**
 * Generic reverse-proxy to NestJS.
 *
 * Client components call /api/proxy/<nestjs-path> via TanStack Query.
 * This handler reads the httpOnly session cookie, adds Authorization: Bearer,
 * and forwards the request to NestJS — keeping the JWT off client JS entirely.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/shared/auth';

const NESTJS_URL = process.env.NESTJS_URL ?? 'http://localhost:3000';

// This proxy is a per-user authenticated passthrough. It must never be cached:
//  - The route is dynamic (reads the session cookie per request).
//  - Upstream fetches must bypass Next.js' Data Cache, otherwise GET responses
//    (bookings, schedule, test-results, …) are served stale — and because the
//    Data Cache keys on URL (not the Authorization header) one user's data could
//    even be returned to another. `force-no-store` opts every fetch out.
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function buildAuthHeaders(): Record<string, string> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function proxy(
  request: NextRequest,
  { params }: { params: { path: string[] } },
  method: string,
): Promise<NextResponse> {
  const pathStr = params.path.join('/');
  const search = request.nextUrl.search;
  const url = `${NESTJS_URL}/${pathStr}${search}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...buildAuthHeaders(),
  };

  let body: string | undefined;
  if (method !== 'GET' && method !== 'DELETE') {
    body = await request.text();
  }

  const upstream = await fetch(url, { method, headers, body, cache: 'no-store' });

  // 204 No Content has no body
  if (upstream.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  const contentType = upstream.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const data: unknown = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  }

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': contentType || 'text/plain' },
  });
}

type Ctx = { params: { path: string[] } };

export const GET = (req: NextRequest, ctx: Ctx) => proxy(req, ctx, 'GET');
export const POST = (req: NextRequest, ctx: Ctx) => proxy(req, ctx, 'POST');
export const PUT = (req: NextRequest, ctx: Ctx) => proxy(req, ctx, 'PUT');
export const PATCH = (req: NextRequest, ctx: Ctx) => proxy(req, ctx, 'PATCH');
export const DELETE = (req: NextRequest, ctx: Ctx) => proxy(req, ctx, 'DELETE');
