import type { ConsultationActionType } from '@/entities/consultation-record';
import type { MetricRef } from '@/entities/test-result';
import type { Outcome } from '@/shared/config';
import type { ProductCatalogItem } from '@/entities/product';
import type { Challenge } from '@/entities/challenge';
import type { SubjectTestResultDto } from '@/entities/test-result';
import type { ReactNode } from 'react';

// ── model/draft types ──────────────────────────────────────────────────────────

export interface ConsultationRecordDraft {
  summary: string;
  recommendation: string;
  followUp: string | null;
  actions: Set<ConsultationActionType>;
  outcome: Outcome;
  productIds: Set<string>;
  metricRefs: Set<string>;
  challengeId?: string;
}

export interface ConsultationRecordDraftInput {
  summary: string;
  recommendation: string;
  followUp: string | null;
  actions: ConsultationActionType[];
  outcome: Outcome;
  productIds: string[];
  metricRefs: MetricRef[];
  challengeId?: string;
}

// ── ui/ConsultationRecordForm types ───────────────────────────────────────────

export type AccentColor = 'teal' | 'amber' | 'gray';

export type RecordInitialValues = {
  summary: string;
  recommendation: string;
  followUp: string | null;
  actions: ConsultationActionType[];
  outcome: Outcome;
  productIds: string[];
  metricRefs: MetricRef[];
};

export type Props = {
  bookingId: string;
  onSuccess: () => void;
  /** 'create' (default) writes a new record; 'edit' updates an existing one. */
  mode?: 'create' | 'edit';
  /** Required in edit mode — the record being updated. */
  recordId?: string;
  /** Pre-fill values for edit mode. */
  initial?: RecordInitialValues;
  /** Exit edit mode without saving. */
  onCancel?: () => void;
};

export type SectionLabelProps = {
  icon: ReactNode;
  title: string;
  hint?: string;
  required?: boolean;
  trailing?: ReactNode;
};

export type ProductMultiselectProps = {
  products: ProductCatalogItem[];
  selected: Set<string>;
  onToggle: (id: string) => void;
};

export type MetricCheckboxesProps = {
  testResults: SubjectTestResultDto[];
  selected: Set<string>;
  onToggle: (encoded: string) => void;
};

export type ChallengeSelectProps = {
  challenges: Challenge[];
  value: string;
  onChange: (challengeId: string) => void;
};
