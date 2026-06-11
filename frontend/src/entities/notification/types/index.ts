export interface NotificationItem {
  id: string;
  type: string;
  channel?: string;
  status?: string;
  createdAt: string;
  payload?: Record<string, unknown> | null;
}
