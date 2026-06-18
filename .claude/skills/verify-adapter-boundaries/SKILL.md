---
name: verify-adapter-boundaries
description: 어댑터 경계(NotificationChannelAdapter·GuidanceGenerator·QaAnswerGenerator)의 enum 동기화, fail-soft 계약, 결정론 폴백 존재를 검사합니다. 알림 채널이나 LLM 생성기를 추가·수정한 후 사용.
---

# 어댑터 경계 검증

이 프로젝트는 **비결정성과 미구현 기능을 어댑터 인터페이스 뒤로 가두는** 패턴을 세 번 반복했다.

| 어댑터 | ADR | 가두는 대상 |
|---|---|---|
| `NotificationChannelAdapter` | [0004](../../../docs/05-adr/0004-notification-simulation.md) | 실제 발송 미구현 (비목표를 어댑터 경계로 표현) |
| `GuidanceGenerator` | [0014](../../../docs/05-adr/0014-local-llm-fallback-summary.md) | LLM 출력의 비결정성 (상담사용 사전 가이던스) |
| `QaAnswerGenerator` | [0018](../../../docs/05-adr/0018-customer-ai-qa.md) | LLM 출력의 비결정성 (고객용 해석 Q&A) |

세 인터페이스는 **의도적으로 동형(isomorphic)**이다 — 코드 주석이 명시적으로 서로를 참조한다. 한쪽 규약이 깨지면 나머지 둘의 근거도 함께 무너지므로 한 스킬로 묶어 검사한다.

TypeScript는 `implements` 절의 시그니처만 강제한다. **enum 값과 어댑터 구현의 1:1 대응, `available()`이 절대 throw하지 않는다는 계약, 결정론 폴백의 존재는 타입 시스템 밖에 있다.**

## 목적

1. **인터페이스 준수** — 각 구현체가 해당 인터페이스를 `implements`로 선언한다
2. **enum ↔ 구현 동기화** — `NotificationChannel` enum 값마다 어댑터가 정확히 하나 존재한다
3. **모듈 등록** — 모든 구현체가 DI 프로바이더로 등록되어 있다
4. **fail-soft 계약** — `available()`이 throw하지 않는다(probe 실패는 false이지 예외가 아니다)
5. **결정론 폴백** — 각 LLM 생성기마다 template 대응물이 존재하고 서비스가 실제로 폴백한다

## 실행 시점

- `NotificationChannel` enum에 값을 추가한 후
- `backend/src/notification/channels/`에 어댑터를 추가한 후
- `GuidanceGenerator`·`QaAnswerGenerator` 구현을 추가·수정한 후
- Ollama 호출 로직(타임아웃·URL·모델)을 변경한 후
- Pull Request 생성 전

## Related Files

| File | Purpose |
|------|---------|
| `docs/05-adr/0004-notification-simulation.md` | 어댑터 경계 패턴의 최초 결정 |
| `docs/05-adr/0014-local-llm-fallback-summary.md` | `GuidanceGenerator` + Ollama/template 이중 구현 |
| `docs/05-adr/0018-customer-ai-qa.md` | `QaAnswerGenerator` + 스코프 가드 2중 레이어 |
| `backend/src/notification/channels/notification-channel.interface.ts` | `NotificationChannelAdapter` 정의 |
| `backend/src/notification/channels/console.channel.ts` | `CONSOLE` — ADR 0004의 유일한 실동작 채널 |
| `backend/src/notification/channels/in-app.channel.ts` | `IN_APP` |
| `backend/src/notification/channels/email.channel.ts` | `EMAIL` — 시뮬레이션 |
| `backend/src/notification/channels/sms.channel.ts` | `SMS` — 시뮬레이션 |
| `backend/src/notification/notification.module.ts` | 채널 어댑터 DI 등록 |
| `backend/src/consultation/guidance/guidance-generator.interface.ts` | `GuidanceGenerator` 정의 |
| `backend/src/consultation/guidance/ollama.guidance.ts` | LLM 구현 |
| `backend/src/consultation/guidance/template.guidance.ts` | 결정론 폴백 |
| `backend/src/consultation/guidance/guidance.module.ts` | 생성기 DI 등록 |
| `backend/src/qa/qa-answer.interface.ts` | `QaAnswerGenerator` 정의 |
| `backend/src/qa/ollama.qa.ts` | LLM 구현 |
| `backend/src/qa/template.qa.ts` | 결정론 폴백 + 스코프 가드 폴백 |
| `backend/src/qa/scope.ts` | 스코프 가드 (ADR 0018 2중 레이어의 한 축) |
| `backend/prisma/schema.prisma` | `NotificationChannel` enum 정의 |
| `backend/test/guidance-generation.spec.ts` | 가이던스 폴백 런타임 검증 |
| `backend/test/qa-scope.spec.ts` | Q&A 스코프 격리 런타임 검증 |

## 워크플로우

모든 명령은 `backend/` 디렉토리에서 실행한다.

### Step 1: enum ↔ 어댑터 동기화

**검사:** `NotificationChannel` enum 값마다 그 값을 선언하는 어댑터가 정확히 하나 있다.

```bash
cd backend
echo "--- enum 값 ---"
sed -n '/^enum NotificationChannel/,/^}/p' prisma/schema.prisma | grep -oE '^\s+[A-Z_]+' | tr -d ' '
echo "--- 어댑터가 선언한 채널 ---"
grep -rhoE 'NotificationChannel\.[A-Z_]+' src/notification/channels/*.channel.ts | sort -u | sed 's/NotificationChannel\.//'
```

**PASS:** 두 목록이 정확히 일치한다. 현재 기준선: `CONSOLE` `IN_APP` `EMAIL` `SMS` 4개.

**FAIL:**
- enum에만 있는 값 → 그 채널로 예약된 알림이 **디스패치 시 조용히 유실된다**. 어댑터를 추가한다.
- 어댑터에만 있는 값 → Prisma 타입 에러가 먼저 나므로 실제로는 발생하지 않는다. 났다면 `prisma generate`가 밀린 것이다.
- 한 값에 어댑터 2개 → 스케줄러가 어느 것을 쓸지 비결정적이다. 하나로 합친다.

### Step 2: 인터페이스 준수 + 모듈 등록

**검사:** 구현체가 인터페이스를 선언하고, DI에 등록되어 있다. 등록되지 않은 어댑터는 존재하지만 절대 호출되지 않는다.

```bash
cd backend
echo "--- implements 선언 ---"
grep -rn 'implements \(NotificationChannelAdapter\|GuidanceGenerator\|QaAnswerGenerator\)' src --include='*.ts'
echo "--- 모듈 providers 등록 ---"
grep -n 'ChannelAdapter\|Generator' \
  src/notification/notification.module.ts \
  src/consultation/guidance/guidance.module.ts \
  src/qa/qa.module.ts
```

**PASS:** 기준선 — `implements` 8개(채널 4 + 가이던스 2 + QA 2), 각 모듈의 `providers` 배열에 전부 등재.

| 인터페이스 | 구현체 |
|---|---|
| `NotificationChannelAdapter` | `Console` `InApp` `Email` `Sms` |
| `GuidanceGenerator` | `OllamaGuidanceGenerator` `TemplateGuidanceGenerator` |
| `QaAnswerGenerator` | `OllamaQaGenerator` `TemplateQaGenerator` |

**FAIL:** `implements` 없이 덕 타이핑으로 맞춘 구현은 인터페이스가 바뀔 때 컴파일 에러가 나지 않는다. 명시적으로 선언한다. `providers`에 없으면 `@Module`에 추가한다.

### Step 3: fail-soft 계약 (`available()`)

**검사:** 두 인터페이스 모두 `available()`을 **"짧은 타임아웃 readiness probe; never throws (fail-soft)"**로 규정한다. probe가 throw하면 폴백 분기 자체에 도달하지 못하고 요청이 500으로 끝난다.

```bash
cd backend
for f in src/consultation/guidance/ollama.guidance.ts src/qa/ollama.qa.ts; do
  echo "--- $f"
  sed -n '/async available/,/^  }/p' "$f"
done
```

**PASS:** 각 `available()` 본문이 `try { ... } catch { return false; }` 형태로 **모든 예외를 삼킨다**. 네트워크 실패·타임아웃·비-JSON 응답 어느 것도 밖으로 나가지 않는다. 타임아웃 신호(`AbortSignal`/`AbortController`)가 걸려 있어 Ollama가 응답하지 않을 때 매달리지 않는다.

**FAIL:** `catch`가 없거나 특정 에러만 잡으면 계약 위반이다. 인터페이스 주석이 명시한 대로 무조건 `false`를 반환하게 만든다. 로깅은 해도 되지만 rethrow는 안 된다.

### Step 4: 결정론 폴백 존재와 실사용

**검사:** LLM 어댑터마다 template 대응물이 있고, **서비스가 실제로 그것으로 넘어간다.** 폴백 클래스가 존재하기만 하고 호출되지 않으면 없는 것과 같다.

두 서비스는 **서로 다른 폴백 전략**을 쓴다. 둘 다 유효하므로 한쪽 기준으로 다른 쪽을 재단하지 마라.

```bash
cd backend
echo "--- 폴백 구현체 파일 ---"
ls src/consultation/guidance/template.guidance.ts src/qa/template.qa.ts
echo "--- guidance: probe 우선 전략 ---"
grep -n 'available()\|this\.template\.' src/consultation/guidance/guidance.service.ts
echo "--- qa: try/catch + 가드레일 전략 ---"
grep -n 'this\.template\.generate\|this\.ollama\.generate\|catch' src/qa/qa.service.ts
```

**PASS:**

| 서비스 | 전략 | 폴백 트리거 |
|---|---|---|
| `guidance.service.ts` | **probe 우선** — `this.ollama.available()`로 먼저 확인 후 분기 | probe false |
| `qa.service.ts` | **probe 없음** — 동기 임계경로라 왕복을 아끼고 곧장 `generate()` 시도 | ① 포화(in-flight 상한) 즉시 폴백 ② `generate()` throw ③ 답변 가드레일 위반 |

`qa.service.ts`는 `this.template.generate(...)` 호출 지점이 **3곳 이상**이어야 한다 — 세 트리거 각각에 대응한다. `guidance.service.ts`는 `available()` 호출이 있고 false 분기에서 template을 부른다.

**FAIL:**
- LLM 생성기만 주입하고 폴백 호출이 0곳 → Ollama가 꺼진 환경에서 기능 전체가 죽는다. 이 프로젝트는 로컬 LLM을 전제하므로 폴백은 선택이 아니라 요구사항이다.
- `qa.service.ts`의 폴백 지점이 3곳 미만 → 어느 트리거가 빠졌는지 확인한다. 특히 `catch` 블록에서 폴백 없이 rethrow하면 **고객이 에러 화면을 본다** (ADR 0018의 핵심 요구 위반).
- `guidance.service.ts`에서 `available()` 호출이 사라짐 → probe 없이 매번 LLM을 때리게 되어 타임아웃이 상담사 화면에 그대로 노출된다.

### Step 5: Ollama 설정 일관성

**검사:** 두 Ollama 어댑터가 같은 환경변수 규약을 쓴다. 서로 다른 변수를 읽으면 한쪽만 동작하는 상태가 조용히 생긴다.

`.env.example` 검사는 **접두사가 아니라 실제 참조된 변수명 전체**를 대조한다. `OLLAMA`로만 grep하면 `SUMMARY_MODEL`·`QA_LLM_TIMEOUT_MS` 같은 변수를 통째로 놓친다.

```bash
cd backend
echo "--- 어댑터가 읽는 env 변수 ---"
grep -rhoE 'process\.env\.[A-Z0-9_]+' src --include='*.ts' | sed 's/process\.env\.//' | sort -u > /tmp/env-used.txt
cat /tmp/env-used.txt
echo "--- .env.example에 선언되지 않은 것 ---"
while read -r v; do grep -qE "^#?\s*${v}=" .env.example || echo "MISSING in .env.example: $v"; done < /tmp/env-used.txt
echo "--- baseUrl 기본값 일치 ---"
grep -n 'OLLAMA_BASE_URL' src/consultation/guidance/ollama.guidance.ts src/qa/ollama.qa.ts
```

**PASS:** `MISSING` 0줄. 두 Ollama 어댑터가 같은 변수(`OLLAMA_BASE_URL`)를 읽고 동일한 기본값(`http://localhost:11434`)으로 폴백한다.

기준선(스킬 생성 시점): `.env.example`이 `DATABASE_URL` `JWT_SECRET` `JWT_EXPIRES_IN` `REMINDER_LEAD_MINUTES` `PORT` `OLLAMA_BASE_URL` `SUMMARY_MODEL` `QA_LLM_TIMEOUT_MS` `QA_LLM_MAX_INFLIGHT` `QA_DEFLECTION_WINDOW_DAYS` `QA_RATELIMIT_TTL` `QA_RATELIMIT_LIMIT`을 선언한다.

**FAIL:** 변수명이 갈리면 통일한다. `.env.example`에 없는 변수는 추가한다 — 없으면 새 환경에서 조용히 기본값으로 떨어져 원인 파악이 어렵다. `NODE_ENV`처럼 런타임이 주는 변수는 예외사항 6 참조.

### Step 6: 런타임 증명

```bash
cd backend && pnpm test:db:setup && npx jest --config ./test/jest-e2e.json --runInBand \
  test/guidance-generation.spec.ts test/qa-scope.spec.ts
```

**PASS:** 두 스펙 green. 출력을 그대로 보고한다.

## Output Format

```markdown
## 어댑터 경계 검증

| # | 검사 | 결과 | 위반 |
|---|------|------|------|
| 1 | enum ↔ 어댑터 동기화 | PASS / FAIL | (누락 채널) |
| 2 | 인터페이스 준수 + 등록 | PASS / FAIL | (클래스명) |
| 3 | `available()` fail-soft | PASS / FAIL | (파일:줄) |
| 4 | 결정론 폴백 실사용 | PASS / FAIL | (서비스) |
| 5 | Ollama 설정 일관성 | PASS / FAIL | (변수명) |
| 6 | 런타임 증명 | PASS / FAIL | (스펙명) |

### 수정 제안
(위반별 구체적 수정안)
```

## 예외사항

다음은 **위반이 아닙니다**:

1. **`Email`·`Sms` 어댑터가 실제로 발송하지 않음** — ADR 0004의 핵심 결정이다. 실발송은 **명시적 비목표**이며, 어댑터 경계는 그 비목표를 코드로 표현한 것이다. `CONSOLE`만 실동작하는 것이 설계대로다. "미구현"으로 보고하지 마라.
2. **`generate()`는 throw해도 됨** — fail-soft 계약은 `available()`에만 걸린다. `generate()`의 실패는 서비스 층에서 잡아 Template으로 폴백하는 것이 정상 흐름이다. 두 메서드를 같은 기준으로 보지 마라.
3. **Template 생성기가 `available()`에서 항상 true를 반환** — 결정론 구현은 외부 의존이 없으므로 probe가 무의미하다. 항상 준비된 것이 맞다.
4. **세 인터페이스의 메서드 시그니처가 서로 다름** — 동형이라는 것은 *구조*(probe + 생성, 비결정성 격리)가 같다는 뜻이지 시그니처가 같아야 한다는 뜻이 아니다. `NotificationChannelAdapter`에 `available()`이 없는 것은 정상이다.
5. **`scope.ts`가 인터페이스를 구현하지 않음** — 스코프 가드는 어댑터가 아니라 생성 전후에 적용되는 순수 함수 필터다. Step 2의 대상이 아니다.
6. **`NODE_ENV` 등 런타임 제공 변수** — 플랫폼이 주입하는 표준 변수는 `.env.example`에 선언하지 않아도 된다. Step 5의 `MISSING` 목록에서 이런 변수는 제외하고 판단한다.
7. **두 서비스의 폴백 전략이 다름** — `guidance`는 probe 우선, `qa`는 probe 없이 try/catch다. QA가 동기 임계경로(고객이 기다리는 중)라 probe 왕복을 아낀 의도적 차이다. 한쪽에 맞춰 통일하라고 보고하지 마라.
