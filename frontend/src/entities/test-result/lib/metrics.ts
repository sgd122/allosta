/** Helpers for the untyped JSON `metrics` field on a TestResult. */

import type { TestMetric } from '../types';

export function toMetricList(metrics: unknown): TestMetric[] {
  if (!Array.isArray(metrics)) return [];
  return metrics.filter(isTestMetric);
}

function isTestMetric(value: unknown): value is TestMetric {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.metricKey === 'string';
}

const SERVICE_TYPE_LABELS: Record<string, string> = {
  METABOLIC_6: '대사 6종 검사',
  FOOD_INTOLERANCE: '음식물 과민 반응 검사',
  STRESS_AGING: '스트레스·노화 검사',
  NUTRIENT_HEAVY_METAL: '영양·중금속 검사',
  GUT_MICROBIOME: '장내 미생물 검사',
  HORMONE: '호르몬 검사',
  PET_NUTRITION: '펫 영양 검사',
};

export function formatServiceType(serviceType: string): string {
  return SERVICE_TYPE_LABELS[serviceType] ?? serviceType;
}

const METRIC_LABELS: Record<string, string> = {
  beneficialRatio: '유익균 비율',
  cortisol: '코티솔',
  cortisolAm: '오전 코티솔',
  dairyIgG: '유제품 IgG',
  diversityIndex: '다양성 지수',
  eggIgG: '계란 IgG',
  estradiol: '에스트라디올',
  ferritin: '페리틴',
  firmicutesBacteroidetes: 'F/B 비율',
  glucose: '공복혈당',
  hba1c: '당화혈색소',
  hdl: 'HDL 콜레스테롤',
  insulin: '공복인슐린',
  ldl: 'LDL 콜레스테롤',
  lead: '납',
  mercury: '수은',
  oxidativeStress: '산화스트레스',
  petOmega3: '반려동물 오메가3',
  petTaurine: '타우린',
  telomereIndex: '텔로미어 지수',
  triglycerides: '중성지방',
  tsh: '갑상선자극호르몬',
  vitaminD: '비타민 D',
  wheatIgG: '밀 IgG',
};

export function formatMetricKey(metricKey: string): string {
  return METRIC_LABELS[metricKey] ?? metricKey;
}

export function metricStatusColor(status?: string): 'teal' | 'amber' | 'red' | 'gray' {
  switch (status) {
    case '정상': return 'teal';
    case '주의': return 'amber';
    case '위험': return 'red';
    default: return 'gray';
  }
}
