# ADR 0014 — 로컬 LLM 폴백 요약 (Local-LLM Fallback Summary)

- **상태**: Accepted
- **날짜**: 2026-06-12
- **관련**: [0006 ops-hardening](./0006-ops-hardening.md)(OpsScheduler `@Interval` 스윕 패턴), [0007 challenge-enrollment](./0007-challenge-enrollment.md)(createRecord 트랜잭션 구조), [04-system-design §2·§10·§11](../04-system-design.md), [02-requirements FR3·AC-P1~P7](../02-requirements.md)

## 맥락

`createRecord`(`POST /consultation-records`) 커밋 후 상담사가 기록을 재열람할 때 AI가 요약한 메모를 함께 볼 수 있으면 생산성이 높아진다는 요구가 제기되었다.

이 기능을 설계할 때 세 가지 긴장이 충돌한다.

1. **재현성 불가침**: 평가자 환경에 Ollama가 없을 수 있다. LLM이 golden path의 critical path에 있으면 `docker compose up` + seed만으로 끝까지 통과해야 하는 NFR1이 깨진다.
2. **기존 `ConsultationRecord.summary` 보존**: `schema.prisma`에 이미 상담사 수동 작성 `summary` 필드가 존재한다. 이 컬럼에 AI 출력을 덮어쓰면 의미가 오염되고, 상담사 입력과 AI 생성물의 생명주기가 섞인다.
3. **테스트 가능성**: LLM 텍스트는 비결정적이므로 `assert`할 수 없다. 평가에서 증명 수단은 테스트이므로, 결정론 경계와 비결정론 경계를 명확히 갈라야 한다.

추가로, 업그레이드 메커니즘으로 `@OnEvent`(fire-and-forget) 방식을 검토했으나 `@nestjs/event-emitter`가 `package.json`에 설치되어 있지 않아 빌드 불가이고, 분리된 Promise는 미처리 거부·재시작 시 유실·단위 테스트 불가 문제가 있어 기각됐다.

## 결정

**별도 `ConsultationAiSummary` 1:1 엔티티를 두고, 결정론 템플릿 요약을 동기 FALLBACK 기본으로 영속하며, 로컬 Ollama 업그레이드는 OpsScheduler `@Interval` 스윕(`sweepPendingUpgrades`)으로 수행한다.**

- **별도 엔티티**: `ConsultationAiSummary { id, recordId @unique, status AiSummaryStatus @default(FALLBACK), model String?, content, createdAt, updatedAt }`. `recordId @unique`가 스윕의 멱등 업서트 타깃을 제공한다. `ConsultationRecord.aiSummary?` back-relation으로 쿼리 편의를 준다.
- **동기 FALLBACK 영속**: `createRecord` 트랜잭션 **커밋 직후** `summary.service.persistFallback(record.id)`를 동기 호출한다. 내부는 결정론 템플릿(`TemplateSummarizer`) — 항상 즉시 완료, Ollama 의존 없음. 트랜잭션 시그니처는 불변이다.
- **OpsScheduler 스윕**: `OpsSchedulerService.handleInterval()`이 `sweepPendingUpgrades()`를 호출한다(`sweepNoShows` 형제). 스윕은 `status=FALLBACK` 행만 대상으로 하며, Ollama가 도달 가능하면 `gemma3n:e4b`로 생성 후 `UPGRADED`로만 업서트한다. 이미 `UPGRADED`면 skip — 절대 downgrade하지 않는다. 멱등.
- **LLM 어댑터 경계**: `SummaryGeneratorInterface`로 `TemplateSummarizer`(결정론)와 `OllamaSummarizer`(로컬 LLM)를 분리한다. `OllamaSummarizer`의 `available()` 헬스체크가 실패하면 스윕은 해당 사이클을 건너뛴다. 환경 변수 미설정 시 기본값(`OLLAMA_BASE_URL=http://localhost:11434`, `SUMMARY_MODEL=gemma3n:e4b`)을 사용하며 startup assertion 없음 — **fail-soft**.
- **manual sweep 엔드포인트**: `POST /admin/summary/sweep` (`@Roles ADMIN`) → `{ upgraded }`. 데모에서 `@Interval` 5s 사이클을 기다리지 않고 즉시 UPGRADED 확인이 가능하다.

## 대안

| 안 | 내용 | 기각 사유 |
|---|---|---|
| **B. `ConsultationRecord` 인라인 컬럼** (`aiSummary`/`aiSummaryStatus` 컬럼 직접 추가) | 테이블·JOIN 없음, 마이그레이션 절감 | `recordId @unique`가 없어 스윕의 멱등 업서트 타깃이 모호해진다. 더 중요하게는, 인라인 nullable 컬럼은 `createRecord` 트랜잭션 안에서 LLM을 호출하고 싶은 유혹을 구조적으로 약화시켜 재현성 원칙(NFR1)을 위협한다. 별도 엔티티는 이 경로를 아키텍처 수준에서 차단한다. |
| **C-event. `@OnEvent` / fire-and-forget** | createRecord 후 이벤트 발행 → 비동기 업그레이드 | `@nestjs/event-emitter`가 `package.json`에 설치되어 있지 않아 빌드 불가. 분리된 Promise는 미처리 거부·서버 재시작 시 유실·단위 테스트 불가 — 기존 OpsScheduler `@Interval` 패턴(ADR 0006)의 자기위배. |

## 결과

- **스키마(additive 마이그레이션 `20260612064400_consultation_prep_automation`)**: `Booking.concern String?`(선택 사전질문, `@MaxLength(1000)`, 브리핑에 write-only) · `Booking.briefOpenedAt DateTime?`(상담사 최초 브리핑 열람 시각) · `ConsultationAiSummary` 모델 + `AiSummaryStatus` enum · `ConsultationRecord.aiSummary?` back-relation. 순수 additive — 기존 테이블 ALTER 없음.
- **백엔드**: `SummaryModule`(TemplateSummarizer, OllamaSummarizer, SummaryService) 신설. `ConsultationModule → imports: [SummaryModule]`. `OpsSchedulerModule → imports`에 `SummaryModule` 추가. `POST /admin/summary/sweep` 데모 엔드포인트 추가.
- **사전 브리핑**: `GET /counselor/bookings/:bookingId/brief` (`@Roles COUNSELOR`, 소유권 `assertBookingOwnedByCounselor` 재사용) — 결정론 조립(TestResult 지표 `metricKey` asc 정렬 + 이상 플래그 · 과거 ConsultationRecord `createdAt` desc · ACCEPTED FamilyLink 맥락 · `concern`). 최초 열람 시 `briefOpenedAt`을 조건부 `updateMany({ where: { id, briefOpenedAt: null } })`로 1회만 기록(DB 레이어 멱등).
- **Analytics**: `briefOpenRate`(분자=`briefOpenedAt != null`, 분모=`status IN (CONFIRMED,COMPLETED,NO_SHOW)`) + `aiSummaryCount` + `aiSummaryUpgradedRatio`. `getCounselorRecords`가 `aiSummary` relation을 포함해 반환.
- **프론트엔드(FSD)**: `entities/consultation-brief`, `features/view-booking-brief`(상담사 일정 브리핑 패널), `features/trigger-summary-sweep`(관리자 데모 버튼), `entities/consultation-record` AiSummaryPanel(FALLBACK/UPGRADED 배지), 대시보드 `BriefProductivityCard`(브리핑 열람률), `features/complete-booking` 선택 `concern` 텍스트영역.
- **테스트**: 백엔드 18 suites / 122 tests green. AC-P1~P7 커버. 골든패스 e2e에 브리핑 열람 단계 추가.
- **트레이드오프**: 테이블 1개 + read JOIN 1회 추가. Ollama 없는 환경에서는 항상 FALLBACK(결정론 템플릿 텍스트)이 표시된다. Ollama 설치 후 `ollama pull gemma3n:e4b`를 실행하면 ~5s(1 스윕 사이클) 내에 UPGRADED 요약이 노출된다. request path는 Ollama 유무와 무관하게 항상 즉시·결정론이다.

## Follow-ups (해결됨)

| 항목 | 결정 |
|------|------|
| 데모 UPGRADED 트리거 방식 | `POST /admin/summary/sweep` 수동 엔드포인트 채택 (`@Interval` 대기 불요) |
| `concern` 고객 read 노출 여부 | write-only — 브리핑에만 기록하고 고객 API로 반환하지 않음 |
| `concern` 길이 상한 | `@MaxLength(1000)` DTO 적용 확정 |
| env 미설정 시 startup 검증 | fail-soft — 미설정 시 기본값, startup assertion 없음 |
