import type { SubjectType } from '@/shared/config';

export type MetricStatus = '정상' | '주의' | '위험';

export interface TestMetric {
  metricKey: string;
  label?: string;
  value: number | string | null;
  unit?: string | null;
  referenceRange?: string;
  status?: MetricStatus;
}

export interface MetricRef {
  testResultId: string;
  metricKey: string;
}

export interface TestResult {
  id: string;
  subjectType: SubjectType;
  subjectId: string;
  serviceType: string;
  metrics: unknown;
  createdAt: string;
}

export interface SubjectTestResultDto {
  id: string;
  serviceType: string;
  metrics: TestMetric[];
  createdAt: string;
}

export interface MetricSelection {
  isSelected: (metricKey: string) => boolean;
  onToggle: (metricKey: string) => void;
}

export interface ResultSectionProps {
  serviceType: string;
  metrics: TestMetric[];
  selection?: MetricSelection;
}
