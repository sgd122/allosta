import type { Outcome } from '@/shared/config';

export const BAR_COLORS = ['#0e5c5b', '#1f8f8c', '#3aa7a3', '#6cc1bd', '#9bd5d1'];

export const OUTCOME_META: Record<Outcome, { label: string; color: string }> = {
  EXPLAINED: { label: '결과 설명',   color: '#5f6b7a' },
  GUIDED:    { label: '영양제 안내', color: '#c9911f' },
  PURCHASED: { label: '구매',       color: '#2f8f5b' },
};

export const EMPTY_FILL = '#e7eeec';

export const ORDER: Outcome[] = ['EXPLAINED', 'GUIDED', 'PURCHASED'];
