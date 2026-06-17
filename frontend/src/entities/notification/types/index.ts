export interface NotificationItem {
  id: string;
  type: string;
  channel?: string;
  status?: string;
  readAt: string | null;
  createdAt: string;
  payload?: Record<string, unknown> | null;
}
