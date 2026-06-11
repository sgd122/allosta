import { type NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/shared/auth';

const NESTJS_URL = process.env.NESTJS_URL ?? 'http://localhost:3000';

/** Shape returned by NestJS POST /auth/login */
interface NestLoginResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    role: 'CUSTOMER' | 'COUNSELOR' | 'ADMIN';
    customerId?: string;
    counselorId?: string;
  };
}

/**
 * POST /api/auth/login
 *
 * Forwards credentials to NestJS, then stores the returned JWT in an
 * httpOnly + Secure + SameSite=Lax cookie — never exposed to client JS.
 * Returns { role, customerId?, counselorId? } so the client knows where to navigate.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { email?: string; password?: string };

  const upstream = await fetch(`${NESTJS_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: body.email, password: body.password }),
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    return new NextResponse(errText, { status: upstream.status });
  }

  const data = (await upstream.json()) as NestLoginResponse;
  const { accessToken, user } = data;

  const response = NextResponse.json({
    role: user.role,
    customerId: user.customerId,
    counselorId: user.counselorId,
  });

  // AC2 / plan: httpOnly · Secure(prod) · SameSite=Lax
  response.cookies.set(SESSION_COOKIE, accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return response;
}
