import { pfetch } from '@/shared/api';
import type { Analytics, RecordsPage, DrilldownDetail } from '../types';

export async function getAnalytics(): Promise<Analytics> {
  return pfetch<Analytics>('admin/analytics');
}

export async function getAnalyticsScoped(scope?: 'all'): Promise<Analytics> {
  const path = scope === 'all' ? 'admin/analytics?scope=all' : 'admin/analytics';
  return pfetch<Analytics>(path);
}

export async function getAdminRecords(page: number, limit = 20): Promise<RecordsPage> {
  return pfetch<RecordsPage>(`admin/analytics/records?page=${page}&limit=${limit}`);
}

export async function getDrilldown(recordId: string): Promise<DrilldownDetail> {
  return pfetch<DrilldownDetail>(`admin/analytics/drilldown/${recordId}`);
}
