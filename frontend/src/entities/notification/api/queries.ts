import { useQuery } from '@tanstack/react-query';
import { getNotifications } from './index';

/**
 * Query-key factory for the notification slice. Centralizing keys here keeps
 * the cache identity consistent between the hook below and any invalidation
 * done elsewhere (e.g. after a notification is dismissed).
 */
export const notificationKeys = {
  all: ['notifications'] as const,
};

/** Notification list with polling. Matches call-site options in NotificationBell.tsx exactly. */
export function useNotifications() {
  return useQuery({
    queryKey: notificationKeys.all,
    queryFn: getNotifications,
    refetchInterval: 20_000,
    staleTime: 20_000,
  });
}
