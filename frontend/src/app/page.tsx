import { redirect } from 'next/navigation';
import { getServerToken, verifySession, homePathForRole } from '@/shared/auth';

/**
 * Root page — verifies the session cookie and redirects to the role's home.
 * No cookie, or an invalid/expired/tampered one, sends the user to /login.
 */
export default async function RootPage() {
  const claims = await verifySession(getServerToken());
  if (!claims) redirect('/login');

  redirect(homePathForRole(claims.role));
}
