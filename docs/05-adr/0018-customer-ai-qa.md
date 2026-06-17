# ADR 0018 — 고객용 검사결과 AI Q&A

## Status
Accepted

## Context
`/results`의 고객은 "이 수치가 무슨 뜻이죠?" 류의 저부가 질문을 위해 1:1 상담을 예약하곤 한다. 이런 질문은 상담사의 고부가 시간을 소모한다. 목표는 **셀프서비스 이탈(deflection)**: 해석 가능한 질문을 AI가 해소하고, 그 외에는 기존 상담 예약으로 안내한다. 안전이 크리티컬한 영역(고객 대면 건강 텍스트)이므로 **해석 전용**으로 범위를 엄격히 제한한다.

## Decision
`/results`에 **추가형(optional)·해석 전용·LLM 그라운딩** Q&A 표면을 도입한다. ADR 0014의 로컬 Ollama + 결정론 템플릿 fail-soft 스택을 **인터랙티브(동기) 경로**로 확장한다.

- **답변 엔진 (Decision A1)**: 동기 Ollama 호출(`gemma4:e4b` 재사용) + 짧은 타임아웃(`QA_LLM_TIMEOUT_MS`, 기본 4000ms) → 실패/타임아웃/포화 시 **결정론 템플릿 폴백**. 단일 로컬 모델 보호를 위해 **인플라이트 캡**(`QA_LLM_MAX_INFLIGHT`, 기본 2); 초과 시 즉시 템플릿(`FALLBACK_SATURATED`).
- **멀티턴 컨텍스트 (Decision A1-multiturn, AC2)**: 후속 질문("그럼 그건 어떤 의미예요?")이 맥락을 갖도록 같은 세션의 **직전 턴(USER/ASSISTANT)을 프롬프트에 주입**한다. 동기 경로 지연·프롬프트 크기를 제한하기 위해 **최근 N턴으로 상한**(`MAX_HISTORY_TURNS`, 기본 8턴 ≈ 4교환). 이력은 *맥락*일 뿐 **답변의 사실 근거는 여전히 본인 검사 지표(`indicators`)로 한정**한다. 결정론 템플릿 폴백은 이력을 무시(순수성 유지).
- **남용 가드 (Decision A1-rate)**: 인플라이트 캡은 *LLM*만 보호하고 row 생성은 막지 못한다. 따라서 write 엔드포인트(`POST /qa/sessions`, `/messages`)에 **고객(customerId) 단위 레이트 리밋**(`@nestjs/throttler` + `QaThrottlerGuard`, 기본 30회/60s, `QA_RATELIMIT_LIMIT`·`QA_RATELIMIT_TTL`)을 적용해 인증된 고객의 무한 row 생성/스토리지 고갈을 차단한다. **IP가 아닌 customerId 키링** — 공유 NAT/프록시 IP가 무관한 고객을 throttle하지 않게 하는 올바른 경계.
- **스코프 가드 (Decision B1)**: 프롬프트 가드(레이어 1) + **결정론 후처리**(레이어 2, `qa/scope.ts`). 양측 적용:
  - **질문 게이트**: 진단/치료/처방/복용/식단/영양제 등 범위 밖 질문 → 거절 + 면책 + 상담 예약 CTA(에스컬레이션).
  - **답변 후처리**: 인스코프 질문의 LLM 답변이 조언으로 드리프트하면 **결정론 템플릿 해석(`FALLBACK_GUARDRAIL`)** 으로 대체 — 거절이 아니라 안전한 해석(안전 ∧ 이탈 동시 보존). 후처리는 *조언 의도*(명령형/처방/진단 단정)에만 반응하고 면책 문구의 단순 명사 언급("진단이 아니에요")에는 트립하지 않는다.

## Drivers
안전/책임 · 인터랙티브 지연+신뢰성 · 2주 재사용-우선 타임박스.

## Considered Alternatives
- **A2 백그라운드 잡(큐/폴링)**: 동기 채팅 UX에 부적합 → 기각.
- **A3 템플릿 전용(LLM 없음)**: 자유 텍스트 + LLM 그라운딩이라는 제품 결정과 충돌 → 폴백 레이어로만 잔존.
- **B2 프롬프트만**: 4B 모델의 지시 무시 가능 → 결정론 백스톱 필요 → B1의 레이어 1로 잔존.

## Consequences
- 인터랙티브 타임아웃 env(`QA_LLM_TIMEOUT_MS`)가 ADR 0014의 스윕 타임아웃(30s 상수)과 별개. 모델 2개(`QaSession`/`QaMessage`) + 마이그레이션 `add_qa`.
- **이탈 지표는 질문 대상자(subject) 기준·전역 스코프**(상담사 무관). 질문자(`customerId`)와 대상자(`subjectType/subjectId`)를 구분해 `QaSession`에 스냅샷 저장. behavioral deflection = 미성숙 윈도우(7일 미경과) 제외 후 (세션 시점, +N일] 내 동일 subject 신규 예약 부재율. 대시보드 라벨 "전체 (상담사 무관)".
- `groundedMetricRefs`는 **의도적 비정규화**(읽기 전용 표시용, 쿼리 대상 아님). `QaMessageSource` enum이 FALLBACK 사유(UNAVAILABLE/TIMEOUT/SATURATED/GUARDRAIL)를 세분.
- **단일 로컬 LLM 동시성은 인플라이트 캡으로 처리하며, abort는 fetch만 취소**(Ollama 서버 작업은 지속)한다는 한계를 명시.
- 접근제어는 신규 모델 없이 JWT + `OwnershipService`(본인 + ACCEPTED FamilyLink) 재사용. PHI 보호를 위해 로깅은 식별자/불리언/소스만 기록(지표 값·답변 본문 미기록).
- 기존 직접 예약 플로우(`/book`, 예약 쓰기 경로)는 **완전 무변경**(AC8 회귀 보호).

## Follow-ups
실 gemma 지연 기준 `QA_LLM_TIMEOUT_MS`/인플라이트 임계 튜닝; 한국어 스코프 키워드 코퍼스 확장 및 오거절율 측정; 7일 윈도우·전역 스코프 실데이터 재검토; 포스트-MVP 모델 기반 분류기 검토; 이력 자동 만료(MVP는 무기한 영속).
- **멀티턴 이력의 입력측 가드 (A1-multiturn 한계)**: 스코프 가드(B1)는 *현재* 질문(`classifyScope`)과 *현재* LLM 답변(`violatesAnswerGuardrail`)에만 작동한다. 프롬프트에 재주입되는 이전 ASSISTANT 턴은 재검증되지 않으므로, "그건요?" 같은 후속이 이전 아웃스코프 맥락을 끌어올 수 있다. 답변측 후처리가 처방성 출력은 여전히 차단해 리스크는 제한적이나, "맥락-비근거" 보장이 출력에서만 강제된다. MVP 허용. 포스트-MVP: 이력 주입 전 인스코프 턴만 필터링하거나 재분류하는 입력측 가드 추가 검토.
