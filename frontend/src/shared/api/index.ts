/**
 * HTTP core — all API calls in the app go through pfetch.
 * All calls are routed through /api/proxy/** (Next.js Route Handlers) which
 * reads the httpOnly `allosta_session` cookie server-side and adds Authorization.
 */

const PROXY = '/api/proxy';

/** Maps proxy/NestJS error responses to user-friendly Korean messages. */
export function toFriendlyMessage(error: unknown, fallback = '요청을 처리하지 못했습니다.'): string {
  if (error instanceof Error) {
    const msg = error.message;
    if (msg.includes('409')) return '이미 예약된 시간대입니다. 다른 시간을 선택해 주세요.';
    if (msg.includes('403')) return '이 대상에 대한 권한이 없습니다.';
    if (msg.includes('401')) return '인증이 만료되었습니다. 다시 로그인해 주세요.';
    if (msg) return msg;
  }
  return fallback;
}

export async function pfetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PROXY}/${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (Array.isArray(body.message)) errMsg = body.message.join(', ');
      else if (typeof body.message === 'string') errMsg = body.message;
    } catch {
      /* non-JSON error body — keep HTTP status message */
    }
    throw new Error(`${res.status}: ${errMsg}`);
  }

  return res.json() as Promise<T>;
}
