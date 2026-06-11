import { useQuery } from '@tanstack/react-query';
import { getSchedule } from './index';

/**
 * Query-key factory for the schedule slice. Centralizing keys here keeps the
 * cache identity consistent between the hooks below and any invalidation done
 * elsewhere (e.g. booking mutations that refresh the counselor schedule).
 */
export const scheduleKeys = {
  counselorSchedule: ['counselor-schedule'] as const,
};

/** Counselor schedule entries for the authenticated counselor. */
export function useCounselorSchedule() {
  return useQuery({
    queryKey: scheduleKeys.counselorSchedule,
    queryFn: getSchedule,
  });
}
