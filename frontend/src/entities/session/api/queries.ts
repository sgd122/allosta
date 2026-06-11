import { useQuery } from '@tanstack/react-query';
import { getCurrentUser, getMe } from './index';

/**
 * Query-key factory for the session slice. Centralizing keys here keeps the
 * cache identity consistent between the hooks below and any invalidation done
 * elsewhere (e.g. logout clears the entire client, but other slices may
 * selectively invalidate 'currentUser' after a profile update).
 */
export const sessionKeys = {
  currentUser: ['currentUser'] as const,
  me: ['me'] as const,
};

/**
 * Current authenticated user from the httpOnly session cookie.
 * Matches the existing call-site options in Layout.tsx exactly.
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: sessionKeys.currentUser,
    queryFn: getCurrentUser,
    staleTime: 5 * 60 * 1000,
  });
}

/** Full customer profile from the backend API (authenticated). */
export function useMe() {
  return useQuery({
    queryKey: sessionKeys.me,
    queryFn: getMe,
  });
}
