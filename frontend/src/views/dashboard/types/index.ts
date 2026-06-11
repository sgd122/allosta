import type { Tone } from '@/shared/ui';

export type OpsRateCardProps = {
  label: string;
  sublabel: string;
  value: number;
  tone: Tone;
  delay?: string;
};

export type ChallengeConversionCardProps = {
  enrollments: number;
  conversionRate: number | null;
  delay?: string;
};

export type FunnelStep = { label: string; value: number; tone: Tone };
