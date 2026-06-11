import { useQuery } from '@tanstack/react-query';
import { getChallenges } from './index';

/**
 * Query-key factory for the challenge slice. Centralizing keys here keeps the
 * cache identity consistent between the hook below and any invalidation done
 * elsewhere (e.g. after a new challenge is enrolled).
 */
export const challengeKeys = {
  all: ['challenges'] as const,
};

/**
 * Challenge catalog.
 * @param enabled - Set to false to skip fetching (e.g. in edit mode where
 *   challenge enrollment is not available). Matches call-site options in
 *   ConsultationRecordForm.tsx exactly.
 */
export function useChallenges(enabled = true) {
  return useQuery({
    queryKey: challengeKeys.all,
    queryFn: getChallenges,
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}
