import type { Outcome } from '@/shared/config';
import type { CallOutcome } from '@/entities/call-log';

/** Korean outcome labels for past records shown in the brief. */
export const BRIEF_OUTCOME_LABEL: Record<Outcome, string> = {
  EXPLAINED: '결과 설명',
  GUIDED: '영양제 안내',
  PURCHASED: '구매',
};

/** Korean labels for call attempt outcomes (ADR 0016). */
export const CALL_OUTCOME_LABEL: Record<CallOutcome, string> = {
  CONNECTED: '연결됨',
  NO_ANSWER: '부재중',
  INVALID: '잘못된 번호',
};
