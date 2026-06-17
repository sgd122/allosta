import { pfetch } from '@/shared/api';
import type { NotificationItem } from '../types';

export async function getNotifications(): Promise<NotificationItem[]> {
  return pfetch<NotificationItem[]>('notifications');
}

export async function markNotificationRead(id: string): Promise<NotificationItem> {
  return pfetch<NotificationItem>(`notifications/${id}/read`, { method: 'PATCH' });
}
