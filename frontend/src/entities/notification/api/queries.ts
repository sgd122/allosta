import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getNotifications, markNotificationRead } from './index';

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

/**
 * Marks a single notification as read via PATCH /notifications/:id/read.
 * Invalidates the notifications query on success so the badge count updates.
 */
export function useMarkNotificationReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
