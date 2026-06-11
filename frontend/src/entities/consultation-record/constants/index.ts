import type { ConsultationActionType } from '../types';

export const CONSULTATION_ACTION_LABELS: Record<ConsultationActionType, string> = {
  METRIC_EXPLAINED: '지표 설명',
  DIET_GUIDANCE: '식이 권고',
  SUPPLEMENT_GUIDANCE: '영양제 권고',
  RETEST_GUIDANCE: '재검사 안내',
  LIFESTYLE_GUIDANCE: '생활습관 안내',
};
