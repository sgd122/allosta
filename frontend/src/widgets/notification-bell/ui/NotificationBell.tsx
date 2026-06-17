'use client';

import { Badge, Box, IconButton, Popover, Separator, Text } from '@radix-ui/themes';
import { BellIcon } from '@radix-ui/react-icons';
import { useMarkNotificationReadMutation, useNotifications } from '@/entities/notification';
import { formatDateTime } from '@/shared/lib/format';
import type { NotificationItem } from '@/entities/notification';
import { NOTIFICATION_LABELS } from '../constants';

function describe(n: NotificationItem): string {
  const payloadTitle =
    n.payload && typeof n.payload['title'] === 'string' ? (n.payload['title'] as string) : null;
  return payloadTitle ?? NOTIFICATION_LABELS[n.type] ?? '새로운 알림';
}

export function NotificationBell() {
  const { data: notifications = [] } = useNotifications();
  const markRead = useMarkNotificationReadMutation();

  // Badge shows only unread (readAt == null) notifications.
  const unreadCount = notifications.filter((n) => n.readAt === null).length;
  const totalCount = notifications.length;

  function handleNotificationClick(n: NotificationItem): void {
    if (n.readAt === null) {
      markRead.mutate(n.id);
    }
  }

  return (
    <Popover.Root>
      <Popover.Trigger>
        <Box className="relative inline-flex">
          <IconButton variant="soft" color="gray" size="2" aria-label={`알림 ${unreadCount}건 읽지 않음`}>
            <BellIcon width="16" height="16" />
          </IconButton>
          {unreadCount > 0 && (
            <Badge
              color="amber"
              radius="full"
              className="absolute pointer-events-none"
              style={{ top: -4, right: -4, fontSize: '10px', minWidth: 16, height: 16, padding: '0 3px' }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Box>
      </Popover.Trigger>
      <Popover.Content style={{ width: 300 }} align="end">
        <Text size="1" weight="bold" className="tracking-[0.12em] uppercase text-teal-11 font-mono">
          알림
        </Text>
        <Text size="1" color="gray" ml="2">{totalCount}건</Text>
        <Separator size="4" mt="2" mb="2" />
        {totalCount === 0 ? (
          <Text size="2" color="gray" className="block text-center py-4">
            새로운 알림이 없습니다.
          </Text>
        ) : (
          <Box className="max-h-[300px] overflow-y-auto flex flex-col gap-1">
            {notifications.map((n) => {
              const isRead = n.readAt !== null;
              return (
                <Box
                  key={n.id}
                  p="2"
                  className="rounded-2 cursor-pointer"
                  style={{ opacity: isRead ? 0.5 : 1 }}
                  onClick={() => handleNotificationClick(n)}
                >
                  <Text
                    size="2"
                    weight={isRead ? 'regular' : 'medium'}
                    color={isRead ? 'gray' : undefined}
                    className="block capitalize"
                  >
                    {describe(n)}
                  </Text>
                  <Text size="1" color="gray">
                    {formatDateTime(n.createdAt)}
                  </Text>
                </Box>
              );
            })}
          </Box>
        )}
      </Popover.Content>
    </Popover.Root>
  );
}
