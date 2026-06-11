import { useQuery } from '@tanstack/react-query';
import { getAnalytics, getAnalyticsScoped, getAdminRecords, getDrilldown } from './index';

/** Counselor-facing scope for the performance view. */
export type AnalyticsScope = 'own' | 'all';

/**
 * Query-key factory for the analytics slice. Centralizing keys here keeps the
 * cache identity consistent between the hooks below and any invalidation done
 * elsewhere (mutations in other slices that should refresh analytics).
 */
export const analyticsKeys = {
  summary: ['analytics'] as const,
  scoped: (scope: AnalyticsScope) => ['counselor-analytics', scope] as const,
  records: (page: number) => ['admin-records', page] as const,
  drilldown: (recordId: string) => ['analytics-drilldown', recordId] as const,
};

/** Admin conversion dashboard summary. */
export function useAnalytics() {
  return useQuery({
    queryKey: analyticsKeys.summary,
    queryFn: getAnalytics,
  });
}

/** Paginated admin consultation records; keeps the previous page during fetch. */
export function useAdminRecords(page: number) {
  return useQuery({
    queryKey: analyticsKeys.records(page),
    queryFn: () => getAdminRecords(page),
    placeholderData: (prev) => prev,
  });
}

/** Counselor performance analytics, scoped to own records or the whole team. */
export function useScopedAnalytics(scope: AnalyticsScope) {
  return useQuery({
    queryKey: analyticsKeys.scoped(scope),
    queryFn: () => getAnalyticsScoped(scope === 'all' ? 'all' : undefined),
  });
}

/** Single record drilldown detail. */
export function useDrilldown(recordId: string) {
  return useQuery({
    queryKey: analyticsKeys.drilldown(recordId),
    queryFn: () => getDrilldown(recordId),
  });
}
