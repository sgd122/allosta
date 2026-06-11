import type { Outcome } from '@/shared/config';

export const OUTCOME_COLOR: Record<Outcome, 'teal' | 'amber' | 'gray'> = {
  EXPLAINED: 'gray',
  GUIDED: 'amber',
  PURCHASED: 'teal',
};

export const OUTCOME_KO: Record<Outcome, string> = {
  EXPLAINED: '결과 설명',
  GUIDED: '영양제 안내',
  PURCHASED: '구매',
};
