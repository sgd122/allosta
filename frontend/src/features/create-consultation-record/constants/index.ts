import type { ConsultationActionType } from '@/entities/consultation-record';
import type { Outcome } from '@/shared/config';
import type { AccentColor } from '../types';

export const CONSULTATION_ACTION_ORDER: ConsultationActionType[] = [
  'METRIC_EXPLAINED',
  'DIET_GUIDANCE',
  'SUPPLEMENT_GUIDANCE',
  'RETEST_GUIDANCE',
  'LIFESTYLE_GUIDANCE',
];

/** Radix Select disallows empty-string values, so use a sentinel for "선택 안 함". */
export const NO_CHALLENGE = '__none__';

export const OUTCOMES: { value: Outcome; label: string; hint: string; color: AccentColor }[] = [
  { value: 'EXPLAINED', label: '결과 설명', hint: '검사 결과를 설명함', color: 'gray' },
  { value: 'GUIDED', label: '영양제 안내', hint: '제품을 안내함', color: 'amber' },
  { value: 'PURCHASED', label: '구매', hint: '제품을 구매함', color: 'teal' },
];

/** Active-state Tailwind classes per outcome tone (static so Tailwind keeps them). */
export const OUTCOME_ACTIVE_SURFACE: Record<AccentColor, string> = {
  gray: 'border-gray-7 bg-gray-3',
  amber: 'border-amber-7 bg-amber-3',
  teal: 'border-teal-7 bg-teal-3',
};

export const OUTCOME_ACTIVE_TEXT: Record<AccentColor, string> = {
  gray: 'text-gray-11',
  amber: 'text-amber-11',
  teal: 'text-teal-11',
};
