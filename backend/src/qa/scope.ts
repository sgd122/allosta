/**
 * Deterministic out-of-scope detection for the customer Q&A (ADR 0018, Decision
 * B1). Layer 2 of defense-in-depth: the LLM prompt forbids advice (layer 1),
 * and this pure, model-free classifier enforces the interpretation-only
 * boundary on BOTH sides:
 *   - QUESTION gate: an out-of-scope question is declined + escalated (never
 *     sent to the LLM).
 *   - ANSWER post-filter: if an in-scope question's LLM answer drifts into
 *     advice, the service trips to the deterministic template interpretation
 *     (FALLBACK_GUARDRAIL) — a safe interpretation, NOT a refusal.
 *
 * The keyword corpus is a single reviewable constant. Borderline inputs default
 * to IN-SCOPE (+ disclaimer downstream) — we never silently refuse, so a false
 * positive degrades to a slightly cautious interpretation rather than a dead end.
 */

/**
 * Korean keywords/intents that put a question OUTSIDE interpretation-only scope:
 * diagnosis, treatment, prescription, medication/dosing, diet/food, supplements,
 * surgery/injection. Curated, lowercased, substring-matched. Extend with care —
 * over-broad entries raise the false-refusal rate (measured by scope.spec.ts).
 */
export const QA_OUT_OF_SCOPE_KEYWORDS: readonly string[] = [
  '진단',
  '치료',
  '처방',
  '복용',
  '용량',
  '복용량',
  '먹어도',
  '먹으면',
  '드셔도',
  '식단',
  '영양제',
  '보충제',
  '수술',
  '주사',
  '시술',
  '약물',
  '약 먹', // "이 약 먹어도 되나요" — bare '약' avoided (matches 약간 등 오탐)
  '무슨 약',
];

/**
 * Advice/diagnosis INTENT markers for the answer-side post-filter (imperatives,
 * dosing, prescription, diagnosis assertions). Deliberately NOT the bare nouns
 * (진단/처방/약/식단/권장/추천…): a safe interpretation answer legitimately says
 * "이건 진단이 아니에요", "권장 참조범위는 70–99예요", or "식단과는 무관한
 * 지표예요" and must NOT trip. We key on PRESCRIPTIVE phrasing instead — every
 * entry is an imperative or an action-recommendation conjugation, never a bare
 * topic noun (regression-covered in qa-scope.spec.ts).
 */
export const QA_ANSWER_GUARDRAIL_KEYWORDS: readonly string[] = [
  '드세요',
  '드시',
  '섭취',
  '복용',
  '용량',
  '처방받',
  '처방해',
  '처방을',
  '처방드',
  '영양제를',
  '보충제를',
  '식단을 바꾸',
  '식단을 조절',
  '식단 조절',
  '권장합니다',
  '권장해',
  '추천합니다',
  '추천해',
  '치료',
  '진단됩',
  '진단된',
  '진단명',
  '진단상',
  '수술',
];

const normalize = (text: string): string => text.toLowerCase();

const containsAny = (text: string, keywords: readonly string[]): boolean => {
  const haystack = normalize(text);
  return keywords.some((kw) => haystack.includes(normalize(kw)));
};

/**
 * Classifies a customer QUESTION. Returns `true` when in-scope (interpretation),
 * `false` when out-of-scope (decline + disclaimer + booking CTA). Pure and
 * deterministic — testable without a model.
 */
export function classifyScope(question: string): boolean {
  return !containsAny(question, QA_OUT_OF_SCOPE_KEYWORDS);
}

/**
 * Post-filter for an LLM ANSWER to an in-scope question. Returns `true` when the
 * answer drifts into advice and must be replaced by the deterministic template
 * interpretation (FALLBACK_GUARDRAIL).
 */
export function violatesAnswerGuardrail(answer: string): boolean {
  return containsAny(answer, QA_ANSWER_GUARDRAIL_KEYWORDS);
}
