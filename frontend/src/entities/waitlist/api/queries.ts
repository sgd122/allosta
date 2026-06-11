import { useQuery } from '@tanstack/react-query';
import { getMyWaitlist } from './index';

/**
 * Query-key factory for the waitlist slice. Centralizing keys here keeps the
 * cache identity consistent between the hooks below and any invalidation done
 * elsewhere (e.g., booking mutations that reopen offered slots).
 */
export const waitlistKeys = {
  myWaitlist: ['myWaitlist'] as const,
};

/** Current user's waitlist entries, including any active slot offers. */
export function useMyWaitlist() {
  return useQuery({
    queryKey: waitlistKeys.myWaitlist,
    queryFn: getMyWaitlist,
  });
}
