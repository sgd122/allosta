/**
 * Session cookie name — kept in its own module (no `server-only`, no
 * `next/headers`) so it can be imported from middleware (Edge runtime),
 * Route Handlers, and Server Components alike.
 */
export const SESSION_COOKIE = 'allosta_session';
