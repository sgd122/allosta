/**
 * BioCom's 7 public analysis services (AC1/AC3). `TestResult.serviceType` stays a
 * free string (ADR 0003: seed-only/read-only), but seed and any future filter
 * import these codes from ONE place so the free string can never drift.
 *
 * The frontend keeps its own SERVICE_TYPE_LABELS (Korean display) — these codes
 * are the stable identifiers both sides agree on.
 */
export const SERVICE_TYPES = {
  METABOLIC_6: 'METABOLIC_6',
  FOOD_INTOLERANCE: 'FOOD_INTOLERANCE',
  STRESS_AGING: 'STRESS_AGING',
  NUTRIENT_HEAVY_METAL: 'NUTRIENT_HEAVY_METAL',
  GUT_MICROBIOME: 'GUT_MICROBIOME',
  HORMONE: 'HORMONE',
  PET_NUTRITION: 'PET_NUTRITION',
} as const;

export type ServiceTypeCode = (typeof SERVICE_TYPES)[keyof typeof SERVICE_TYPES];

/** All 7 codes as an array (stable order = display order). */
export const SERVICE_TYPE_CODES: ServiceTypeCode[] = Object.values(SERVICE_TYPES);

/** Korean labels — used for seed logging; the frontend has its own copy. */
export const SERVICE_TYPE_LABELS_KO: Record<ServiceTypeCode, string> = {
  METABOLIC_6: '대사 6종 검사',
  FOOD_INTOLERANCE: '음식물 과민 반응 검사',
  STRESS_AGING: '스트레스·노화 검사',
  NUTRIENT_HEAVY_METAL: '영양·중금속 검사',
  GUT_MICROBIOME: '장내 미생물 검사',
  HORMONE: '호르몬 검사',
  PET_NUTRITION: '펫 영양 검사',
};
