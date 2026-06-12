# ADR 0014 — 상담 전 가이던스 (Pre-Consultation Guidance, Local-LLM Fallback)

- **상태**: Accepted
- **날짜**: 2026-06-12
- **관련**: [0006 ops-hardening](./0006-ops-hardening.md)(OpsScheduler `@Interval` 스윕 패턴), [0007 challenge-enrollment](./0007-challenge-enrollment.md)(createRecord 트랜잭션 구조), [04-system-design §2·§10·§11](../04-system-design.md), [02-requirements FR14·AC-P1~P7](../02-requirements.md)

## 맥락

상담사가 **다가오는 상담을 어떻게 진행할지**를 미리 안내받으면 상담 준비 시간이 줄고 상담 품질이 높아진다는 요구가 제기되었다. 안내는 대상자의 검사 지표 + 과거 상담 기록(+ 고객 선택 `concern`)에서 파생되며, 상담사 **사전 브리핑** 패널에 노출된다(완료된 기록이 아니라 예약 단위 안내).

> 초기에는 `createRecord` 커밋 후 상담사가 기록을 재열람할 때 보는 **사후 요약**으로 설계했으나, 요약은 이미 끝난 상담을 정리할 뿐 상담사의 다음 행동을 바꾸지 못한다. 안내를 **상담 전**으로 옮겨 "이 상담을 어떻게 진행하라"는 실행 가능한 가이던스로 재설계했다.

이 기능을 설계할 때 세 가지 긴장이 충돌한다.

1. **재현성 불가침**: 평가자 환경에 Ollama가 없을 수 있다. LLM이 golden path의 critical path에 있으면 `docker compose up` + seed만으로 끝까지 통과해야 하는 NFR1이 깨진다.
2. **결정론 브리핑 보존**: 사전 브리핑은 검사 지표·과거 기록·가족 맥락을 서버가 결정론적으로 조립하는 읽기 전용 산출물이다. LLM 가이던스는 이 결정론 조립을 대체하지 않고 **보강**해야 한다 — 가이던스가 없어도 브리핑은 항상 성립한다.
3. **테스트 가능성**: LLM 텍스트는 비결정적이므로 `assert`할 수 없다. 평가에서 증명 수단은 테스트이므로, 결정론 경계와 비결정론 경계를 명확히 갈라야 한다.

추가로, 업그레이드 메커니즘으로 `@OnEvent`(fire-and-forget) 방식을 검토했으나 `@nestjs/event-emitter`가 `package.json`에 설치되어 있지 않아 빌드 불가이고, 분리된 Promise는 미처리 거부·재시작 시 유실·단위 테스트 불가 문제가 있어 기각됐다.

## 결정

**예약 단위 `ConsultationBriefGuidance` 1:1 엔티티를 두고, 브리핑 열람 시 결정론 템플릿 FALLBACK 가이던스를 보장하며, 로컬 Ollama 업그레이드는 OpsScheduler `@Interval` 스윕(`sweepPendingUpgrades`)으로 수행한다.**

- **예약 단위 엔티티**: `ConsultationBriefGuidance { id, bookingId @unique, status BriefGuidanceStatus @default(FALLBACK), model String?, content, createdAt, updatedAt }`. `bookingId @unique`가 스윕의 멱등 업서트 타깃을 제공한다. `Booking` 1:1 관계는 `onDelete: Cascade`로 선언한다. 가이던스가 **예약**에 귀속되므로(상담 기록이 아님) 상담 전에도 항상 존재할 수 있다.
- **브리핑 열람 시 FALLBACK 보장**: 상담사가 브리핑을 열면(`getBookingBrief` → `GET /counselor/bookings/:id/brief`) `GuidanceService.ensureFallbackForBooking(bookingId)`가 결정론 템플릿(검사 지표 이상 플래그 + 과거 기록 + `concern` 기반 진행 안내)을 `status=FALLBACK`으로 보장한다 — 항상 즉시 완료, Ollama 의존 없음. `createRecord`는 가이던스를 건드리지 않는다(생명주기 완전 분리).
- **OpsScheduler 스윕**: `OpsSchedulerService.handleInterval()`이 `sweepPendingUpgrades()`를 호출한다(`sweepNoShows` 형제). 스윕은 `status=FALLBACK` 행만 대상으로 하며, Ollama가 도달 가능하면 `gemma4:e4b`로 생성 후 `UPGRADED`로만 업서트한다. 이미 `UPGRADED`면 skip — 절대 downgrade하지 않는다. 멱등.
- **LLM 어댑터 경계**: `GuidanceGeneratorInterface`로 `TemplateGuidance`(결정론)와 `OllamaGuidance`(로컬 LLM)를 분리한다. `OllamaGuidance`의 `available()` 헬스체크가 실패하면 스윕은 해당 사이클을 건너뛴다. 환경 변수 미설정 시 기본값(`OLLAMA_BASE_URL=http://localhost:11434`, `SUMMARY_MODEL=gemma4:e4b`)을 사용하며 startup assertion 없음 — **fail-soft**.
- **수동 트리거 없음**: 데모용 수동 엔드포인트를 두지 않는다. 서버가 `@Interval` 스윕으로 업그레이드를 자동 수행하므로, Ollama+모델이 있으면 ~1 스윕 사이클 내에 자동으로 UPGRADED가 노출된다.

## 대안

| 안                                                                                     | 내용                                            | 기각 사유                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. 사후 요약 (record 단위)**                                                         | createRecord 후 상담 기록에 AI 요약을 부착      | 이미 끝난 상담을 정리할 뿐 상담사의 다음 행동을 바꾸지 못한다. 가이던스를 상담 **전**으로 옮겨 예약 단위로 귀속시키면 "이 상담을 어떻게 진행하라"는 실행 가능한 안내가 된다. record 키 대신 booking 키를 채택해 상담 전에도 가이던스가 존재할 수 있게 한다.            |
| **B. `Booking` 인라인 컬럼** (`guidance`/`guidanceStatus` 컬럼 직접 추가)              | 테이블·JOIN 없음, 마이그레이션 절감             | `bookingId @unique`가 없어 스윕의 멱등 업서트 타깃이 모호해진다. 별도 엔티티는 가이던스 생명주기(FALLBACK→UPGRADED)를 `Booking` 상태 전이와 깨끗이 분리하고, 브리핑 조립(읽기 전용)과 가이던스 업그레이드(비동기)를 구조적으로 떼어 놓는다.                            |
| **C-event. `@OnEvent` / fire-and-forget**                                              | 브리핑 열람 후 이벤트 발행 → 비동기 업그레이드 | `@nestjs/event-emitter`가 `package.json`에 설치되어 있지 않아 빌드 불가. 분리된 Promise는 미처리 거부·서버 재시작 시 유실·단위 테스트 불가 — 기존 OpsScheduler `@Interval` 패턴(ADR 0006)의 자기위배.                                                                 |

## 결과

- **스키마(마이그레이션 `20260612120000_ai_pre_consultation_guidance`)**: `Booking.concern String?`(선택 사전질문, `@MaxLength(1000)`, 브리핑에 write-only) · `Booking.briefOpenedAt DateTime?`(상담사 최초 브리핑 열람 시각) · `ConsultationBriefGuidance` 모델 + `BriefGuidanceStatus` enum(`FALLBACK|UPGRADED`) · `Booking` 1:1 `onDelete: Cascade` 관계.
- **백엔드**: `GuidanceModule`(TemplateGuidance, OllamaGuidance, GuidanceService) 신설. `ConsultationModule → imports: [GuidanceModule]`. `OpsSchedulerModule → imports`에 `GuidanceModule` 추가. 수동 스윕 엔드포인트는 두지 않는다.
- **사전 브리핑**: `GET /counselor/bookings/:bookingId/brief` (`@Roles COUNSELOR`, 소유권 `assertBookingOwnedByCounselor` 재사용) — 결정론 조립(TestResult 지표 `metricKey` asc 정렬 + 이상 플래그 · 과거 ConsultationRecord `createdAt` desc · ACCEPTED FamilyLink 맥락 · `concern`) + `GuidanceService.ensureFallbackForBooking`으로 FALLBACK 가이던스 보장. 최초 열람 시 `briefOpenedAt`을 조건부 `updateMany({ where: { id, briefOpenedAt: null } })`로 1회만 기록(DB 레이어 멱등). 가이던스의 가족 맥락 부분은 ACCEPTED FamilyLink 검사 데이터가 있는 상담에만 게이팅된다.
- **Analytics**: `briefOpenRate`(분자=`briefOpenedAt != null`, 분모=`status IN (CONFIRMED,COMPLETED,NO_SHOW)`)를 headline 생산성 지표로 유지한다. AI 요약 건수·업그레이드 비율 지표(`aiSummaryCount`/`aiSummaryUpgradedRatio`)는 제거됐다.
- **프론트엔드(FSD)**: `entities/consultation-brief`, `features/view-booking-brief`(상담사 사전 브리핑 패널 — 가이던스 FALLBACK/UPGRADED 배지 포함), 대시보드 `BriefProductivityCard`(브리핑 열람률), `features/complete-booking` 선택 `concern` 텍스트영역. 사후 요약 패널과 관리자 수동 스윕 버튼은 제거됐다.
- **테스트**: AC-P1~P7 커버. 골든패스 e2e에 브리핑 열람 + 가이던스 보장 단계 추가. createRecord는 더 이상 AI 산출물을 만들지 않는다.
- **트레이드오프**: 테이블 1개 + 브리핑 열람 시 가이던스 보장 1회 추가. Ollama 없는 환경에서는 항상 FALLBACK(결정론 템플릿 텍스트)이 표시된다. Ollama 설치 후 `ollama pull gemma4:e4b`를 실행하면 ~1 스윕 사이클 내에 UPGRADED 가이던스가 자동 노출된다(수동 트리거 불요). 브리핑 read path는 Ollama 유무와 무관하게 항상 즉시·결정론이다.

## Follow-ups (해결됨)

| 항목                          | 결정                                                                     |
| ----------------------------- | ------------------------------------------------------------------------ |
| 데모 UPGRADED 트리거 방식     | `@Interval` 스윕 자동 업그레이드 — 수동 엔드포인트 제거(서버가 자동 수행) |
| 가이던스 귀속 키              | `bookingId`(예약 단위) — 상담 전에도 가이던스가 존재할 수 있게 함         |
| `concern` 고객 read 노출 여부 | write-only — 브리핑에만 기록하고 고객 API로 반환하지 않음                |
| `concern` 길이 상한           | `@MaxLength(1000)` DTO 적용 확정                                         |
| env 미설정 시 startup 검증    | fail-soft — 미설정 시 기본값, startup assertion 없음                     |
