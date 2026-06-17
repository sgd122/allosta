import { classifyScope, violatesAnswerGuardrail } from '../src/qa/scope';
import { TemplateQaGenerator } from '../src/qa/template.qa';
import { OllamaQaGenerator } from '../src/qa/ollama.qa';
import { normalizeQaMetrics } from '../src/qa/metric-normalize';
import type { QaMetricInput } from '../src/qa/qa-answer.interface';

/**
 * Pure, model-free unit tests for the deterministic Q&A safety layer (ADR 0018,
 * AC5/AC6) and the template interpretation generator (AC4). No app, no DB.
 */
describe('classifyScope — question gate (AC5)', () => {
  it('keeps interpretation questions in-scope', () => {
    expect(classifyScope('공복혈당이 무슨 뜻인가요?')).toBe(true);
    expect(classifyScope('제 수치가 참조범위 안에 있나요?')).toBe(true);
    expect(classifyScope('LDL 콜레스테롤 값이 어떤 의미예요?')).toBe(true);
  });

  it('declines advice/diagnosis/diet/supplement questions', () => {
    expect(classifyScope('이 약 먹어도 되나요?')).toBe(false);
    expect(classifyScope('어떤 영양제를 복용해야 하나요?')).toBe(false);
    expect(classifyScope('무슨 음식을 먹으면 좋을까요?')).toBe(false);
    expect(classifyScope('이거 무슨 병으로 진단되나요?')).toBe(false);
    expect(classifyScope('치료는 어떻게 받아야 하나요?')).toBe(false);
  });
});

describe('violatesAnswerGuardrail — answer post-filter (AC6)', () => {
  it('flags an answer that drifts into advice', () => {
    expect(violatesAnswerGuardrail('비타민D 영양제를 복용하세요.')).toBe(true);
    expect(violatesAnswerGuardrail('매일 채소를 더 드세요.')).toBe(true);
    expect(violatesAnswerGuardrail('이 약을 처방받으시는 것을 추천합니다.')).toBe(true);
  });

  it('passes a pure interpretation answer', () => {
    expect(
      violatesAnswerGuardrail(
        '공복혈당은 공복 상태의 혈당 수치예요. 회원님 값은 참조범위 기준 주의에 해당해요.',
      ),
    ).toBe(false);
  });

  // Regression: bare topic nouns (식단/권장/추천/음식) must NOT trip the
  // guardrail when used in neutral interpretive context. The guardrail keys on
  // prescriptive phrasing only — these once produced false positives that
  // silently discarded a correct LLM answer in favor of the template.
  it('does not flag bare topic nouns in neutral interpretation', () => {
    expect(
      violatesAnswerGuardrail('권장 참조범위는 70–99 mg/dL입니다.'),
    ).toBe(false);
    expect(
      violatesAnswerGuardrail('이 수치는 식단과 직접적인 관련이 없는 지표입니다.'),
    ).toBe(false);
    expect(
      violatesAnswerGuardrail('의학적으로 추천되는 정상 범위 안에 있습니다.'),
    ).toBe(false);
    expect(
      violatesAnswerGuardrail('음식을 먹은 직후에는 수치가 올라갈 수 있어요.'),
    ).toBe(false);
  });

  // The prescriptive conjugations that replaced the bare nouns still catch
  // genuine advice drift.
  it('still flags prescriptive advice phrasing', () => {
    expect(violatesAnswerGuardrail('식단을 조절하시는 것이 좋아요.')).toBe(true);
    expect(violatesAnswerGuardrail('하루 한 알 복용을 권장합니다.')).toBe(true);
    expect(violatesAnswerGuardrail('채소를 더 드시기를 추천해요.')).toBe(true);
  });
});

describe('TemplateQaGenerator — deterministic interpretation (AC4)', () => {
  const generator = new TemplateQaGenerator();

  const metrics: QaMetricInput[] = [
    {
      metricKey: 'glucose',
      label: '공복혈당',
      value: 102,
      unit: 'mg/dL',
      referenceRange: '70–99',
      status: '주의',
    },
  ];

  it('renders the customer value, range and status, never advice', async () => {
    const answer = await generator.generate({ question: '뜻이 뭐예요?', indicators: metrics, history: [] });
    expect(answer.text).toContain('102');
    expect(answer.text).toContain('70–99');
    expect(answer.text).toContain('주의');
    expect(answer.groundedMetricRefs).toEqual(['glucose']);
    // The template must itself stay within scope (no advice verbs/nouns).
    expect(violatesAnswerGuardrail(answer.text)).toBe(false);
  });

  it('is deterministic — same input yields identical output', async () => {
    const a = await generator.generate({ question: 'q', indicators: metrics, history: [] });
    const b = await generator.generate({ question: 'q', indicators: metrics, history: [] });
    expect(a.text).toBe(b.text);
  });

  it('handles an empty metric set safely', async () => {
    const answer = await generator.generate({ question: 'q', indicators: [], history: [] });
    expect(answer.text.length).toBeGreaterThan(0);
    expect(answer.groundedMetricRefs).toEqual([]);
  });
});

/**
 * AC2 multi-turn: the LLM must receive prior session turns so a follow-up like
 * "그럼 그건 어떤 의미예요?" is answered in context. We mock fetch and assert the
 * prompt body, since the deterministic template (used in the e2e env) ignores it.
 */
describe('OllamaQaGenerator — multi-turn prompt (AC2)', () => {
  const metrics: QaMetricInput[] = [
    {
      metricKey: 'glucose',
      label: '공복혈당',
      value: 102,
      unit: 'mg/dL',
      referenceRange: '70–99',
      status: '주의',
    },
  ];

  const okResponse = (text: string) =>
    ({ ok: true, json: async () => ({ response: text }) }) as Response;

  let fetchMock: jest.SpyInstance;
  afterEach(() => fetchMock?.mockRestore());

  const capturePrompt = (): string => {
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    return (JSON.parse(init.body as string) as { prompt: string }).prompt;
  };

  it('includes prior turns so follow-ups have context', async () => {
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(okResponse('공복혈당은 102 mg/dL로 주의예요. 수치 해석입니다.'));

    await new OllamaQaGenerator().generate({
      question: '그럼 그건 어떤 의미예요?',
      indicators: metrics,
      history: [
        { role: 'USER', text: '공복혈당이 뭐예요?' },
        { role: 'ASSISTANT', text: '공복혈당은 공복 상태의 혈당 수치예요.' },
      ],
    });

    const prompt = capturePrompt();
    expect(prompt).toContain('이전 대화');
    expect(prompt).toContain('고객: 공복혈당이 뭐예요?');
    expect(prompt).toContain('보조자: 공복혈당은 공복 상태의 혈당 수치예요.');
    expect(prompt).toContain('고객 질문: 그럼 그건 어떤 의미예요?');
  });

  it('omits the history block on the first question', async () => {
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(okResponse('공복혈당은 102 mg/dL입니다. 수치 해석입니다.'));

    await new OllamaQaGenerator().generate({
      question: '공복혈당이 뭐예요?',
      indicators: metrics,
      history: [],
    });

    expect(capturePrompt()).not.toContain('이전 대화');
  });
});

describe('normalizeQaMetrics', () => {
  it('normalizes the array-of-objects shape with referenceRange', () => {
    const out = normalizeQaMetrics([
      { metricKey: 'b', label: 'B', value: 2, unit: 'x', referenceRange: '1-3', status: '정상' },
      { metricKey: 'a', label: 'A', value: 1, unit: 'y', referenceRange: '0-2', status: '주의' },
    ]);
    expect(out.map((m) => m.metricKey)).toEqual(['a', 'b']); // sorted
    expect(out[0].referenceRange).toBe('0-2');
  });

  it('falls back to a flat key→value object', () => {
    const out = normalizeQaMetrics({ focus_index: 72, stress: 40 });
    expect(out.map((m) => m.metricKey)).toEqual(['focus_index', 'stress']);
    expect(out[0].value).toBe(72);
  });

  it('returns [] for non-object input', () => {
    expect(normalizeQaMetrics(null)).toEqual([]);
    expect(normalizeQaMetrics('nope')).toEqual([]);
  });
});
