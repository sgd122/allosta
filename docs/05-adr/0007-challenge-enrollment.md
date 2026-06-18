# ADR 0007: 챌린지 등록 & 검사 지표 확장 — BioCom finalization (Challenge Enrollment & Metrics Extension)

- **상태**: 확정 (Accepted)
- **날짜**: 2026-06-10
- **결정자**: 설계자 (솔로 과제)

**결정 (한 줄):** BioCom 3-step 완성을 위해 A1+B1+C1 조합(자유 문자열 serviceType + createRecord 트랜잭션 내 원자 등록 + JSONB 배열 additive superset)을 채택한다. 기존 92개 테스트는 무회귀로 유지한다.

---

## Context (결정 배경)

기존 Allosta 플랫폼은 예약·상담 기록·전환 분석을 갖췄으나, BioCom(biocom.kr)의 실제 비즈니스 형태(**검사 → 상담 → 관리 프로그램**의 3-step) 중 **step-3(관리 프로그램 등록)**이 데이터 모델에 없었다. 구체적으로 다음 공백이 열려 있었다.

1. **step-3 추적 공백(R9)**: 상담사가 구매 전환 고객을 관리 프로그램(챌린지)에 등록하는 행위가 구두/수기로만 처리되어, "구매가 실제 관리 프로그램 등록으로 이어졌는가"를 측정할 수 없다.

2. **검사 도메인 미정합**: 기존 시드는 BioCom의 실제 7종 검사 서비스(대사 6종·음식물 과민·스트레스/노화·영양/중금속·장내 미생물·호르몬·펫 영양)와 무관한 일반 데이터(`BLOOD_PANEL`/`GROWTH_PANEL`)였다. 검사 지표에 **참조범위·정상/주의/위험 상태**가 없어 고객이 결과를 해석할 수 없었다.

이 공백을 BioCom 도메인에 맞춰 닫되, **기존 92개 테스트를 단 하나도 깨지 않는** 비파괴적(additive) 방식이라는 강한 제약 아래 설계해야 한다.

결정 동인:

- (1) **92개 테스트 green 유지** — enum 식별자가 Analytics 집계 키이자 테스트 픽스처
- (2) **JSONB metrics의 이중 형태 현실** — seed는 배열 `[{metricKey,value,unit}]`, `seedIsolated`는 평면 객체 `{key:val}`
- (3) **등록 캡처의 최소 blast radius** — 검증된 `createRecord` 트랜잭션·`bookingId @unique` 1-기록 불변식을 깨지 않을 것

이를 위해 (a) serviceType/검사 타입 모델링, (b) 챌린지 등록 캡처 위치, (c) 검사 지표 확장 형태 세 축에서 각각 3개 옵션이 검토되었다.

---

## Decision (결정)

**A1 + B1 + C1을 채택한다 — 비파괴적·원자적·픽스처 보존 조합.**

- **(A1) serviceType는 자유 문자열 + 공유 `SERVICE_TYPES` 상수**: `TestResult.serviceType`는 `String`을 유지한다. 시드 값은 BioCom 7종 코드(`METABOLIC_6`, `FOOD_INTOLERANCE`, `STRESS_AGING`, `NUTRIENT_HEAVY_METAL`, `GUT_MICROBIOME`, `HORMONE`, `PET_NUTRITION`)로 교체한다. seed와 미래 필터는 **단일 `SERVICE_TYPES` 상수**에서 코드를 가져와 자유 문자열 표류를 차단한다. 프론트엔드는 별도 `SERVICE_TYPE_LABELS`로 한글 표시명을 매핑한다.

- **(B1) 챌린지 등록은 `createRecord` 트랜잭션 내 원자 생성**: `CreateConsultationRecordDto`에 **단일 선택적** `challengeId?: string`을 추가한다(배열 아님). 챌린지 존재 가드(`findUnique`)는 `$transaction` **진입 전**에 두어 미존재 시 깨끗한 404를 반환한다(트랜잭션 중간 P2003 회피, 기존 pre-txn 검증 패턴과 정합). 트랜잭션 안에서는 `if (dto.challengeId)`로 감싼 `challengeEnrollment.create` **하나만** 실행한다. `updateRecord`는 등록을 **건드리지 않는다** — products/metrics를 전량 교체하는 delete-all+recreate 특성상 등록에 적용하면 `enrolledAt`·상태가 유실된다. 코드는 outcome에 **게이팅하지 않으며**(어떤 outcome도 등록 가능), 구매(PURCHASED)와의 연관은 UI 컨벤션·Analytics 해석에서만 표현된다.

- **(C1) 검사 지표는 배열 요소를 additive superset으로 확장**: `metrics` JSONB 배열 요소를 `{metricKey, label?, value, unit?, referenceRange?, status?}`로 확장한다(`status ∈ {정상, 주의, 위험}`). 새 키는 기존 객체에 대한 선택적 추가이므로 기존 소비자(`normalizeMetrics`, `toMetricList`)는 `{metricKey,value,unit}`만 읽고 새 필드를 무시한다 — 배열·평면 객체 두 형태 모두 하위호환. 프론트엔드 타입 경계(`TestMetric`)를 함께 넓혀 새 필드가 렌더 경로까지 살아남게 한다. `status`/`referenceRange`는 시드에 사전 계산한다(렌더 시점 파싱 회피).

- **(공통) 마이그레이션은 순수 additive**: `add_challenge` 마이그레이션은 `CREATE TYPE`(`ChallengeEnrollmentStatus`) / `CREATE TABLE`(Challenge, ChallengeEnrollment) / `CREATE UNIQUE INDEX`(`@@unique([recordId])`) / `CREATE INDEX`만 생성하고, 기존 테이블에 `ALTER`를 가하지 않는다. `ChallengeEnrollment`의 4개 FK(`challengeId/customerId/recordId/counselorId`)는 **모두 `onDelete: Cascade`**로 선언해(`ConsultationRecordMetric` 미러링) `cleanupSeeded`가 **변경 없이** 등록 행을 정리하게 한다.

- **(공통) enum 식별자 동결, 라벨만 리브랜딩**: `ConsultationActionType`·`Outcome`·신규 `ChallengeEnrollmentStatus` 식별자는 Analytics 집계 키이자 테스트 픽스처이므로 동결한다. BioCom 어휘 리브랜딩은 **표시 라벨 맵에서만** 수행한다.

---

## Alternatives Considered (검토된 대안)

### (a) serviceType / 검사 타입 모델링

| 옵션 | 장점 | 단점 | 비채택 이유 |
|------|------|------|------------|
| **A1: 자유 문자열 + 공유 상수 (채택)** | 제로 마이그레이션; 현 아키텍처 정합; `seedIsolated`의 임의 `'attention'` 문자열 무영향; 테스트 픽스처 churn 없음; ADR 0003(seed-only/read-only) 정합 | DB 수준 serviceType 검증 없음 | — (채택). 단일 `SERVICE_TYPES` 상수로 표류 방지 |
| **A2: `ServiceType` Prisma enum** | 타입 안전성, autocomplete, DB 수준 유효성 | 실 마이그레이션 필요; `seedIsolated`의 임의 `'attention'` serviceType + golden-path/analytics 픽스처를 깨뜨림(테스트 churn = AC7 위반). TestResult가 seed-only/read-only라 검증 이득 낮음 | AC7(92개 테스트 green) + ADR 0003에 의해 무효화 |
| **A3: 룩업 테이블 `TestType`** | 카탈로그 기반, 런타임 관리 검사 타입 지원, 참조 무결성 | seed-only/read-only 데이터에 과설계(YAGNI); 모든 TestResult 읽기 경로에 JOIN 추가; 신규 테스트 표면; 범위 내 요구 없음 | Principle 5(최소 표면적)에 의해 무효화 |

### (b) 챌린지 등록 캡처 위치

| 옵션 | 장점 | 단점 | 비채택 이유 |
|------|------|------|------------|
| **B1: `createRecord` 트랜잭션 내 등록 (채택)** | 기록 생성과 원자적("상담기록 시 등록"); 소유권 가드·트랜잭션 재사용; 1 round-trip; Analytics가 `recordId → outcome` JOIN | 기록 DTO/트랜잭션 소폭 확장 | — (채택). 필드 선택적 + pre-txn 가드로 미선택 시 동작 변화 0 |
| **B2: 별도 `POST /challenge-enrollments` 엔드포인트** | 깔끔한 분리; 독립 테스트; 기록 생성 무변경 | 비원자적(기록 성공·등록 실패 시 불일치); 2차 소유권 검증; 프론트 mutation·롤백 UX 추가; "상담기록 시 등록" 의미 이탈 | 1차로 비채택. 단 등록 write가 1개 `create`로 고립돼 추후 트랜잭션 결합이 문제되면 무리 없이 분리 가능(가드된 fallback) |
| **B3: `updateRecord`에서도 캡처** | 사후 챌린지 추가·변경 가능 | `updateRecord`가 products/metrics를 **전량 교체**(delete-all+recreate) → 등록에 적용 시 `enrolledAt`·`COMPLETED`/`DROPPED` 상태 유실(데이터 손실) | createRecord 전용으로 해결. 등록 편집은 범위 외(Non-Goal: 최소 표면적) |

### (c) 검사 지표 확장 형태

| 옵션 | 장점 | 단점 | 비채택 이유 |
|------|------|------|------------|
| **C1: 배열 요소 additive superset (채택)** | 순수 superset; `normalizeMetrics`/`toMetricList` 무영향; 배열·평면 객체 모두 하위호환 | `status`/`referenceRange`가 시드에 사전 계산(런타임 파생 아님) — TestResult seed-only/read-only라 수용 | — (채택). 프론트 `TestMetric` 타입·렌더·테스트까지 전 체인 확장 필수(미확장 시 AC6 vanity pass) |
| **C2: 렌더 시점 status를 referenceRange에서 파생** | DRY; 사전 계산 불필요 | BioCom 범위 형식 다양(단방향 임계·양방향 범위·장내 미생물 카테고리형) → 취약한 클라이언트 파싱; 테스트 로직 증가 | Principle 1(시드에 사전 계산, 클라이언트 단순)에 의해 무효화 |
| **C3: 관계형 `Metric` 테이블로 승격** | 쿼리 가능·타입·참조 무결성·JSONB 형태 모호성 제거 | 대규모 마이그레이션; `metrics: Json` 컬럼과 **모든** 소비자·테스트(`normalizeMetrics`, `toMetricList`, `seedIsolated`, golden-path, family) 파괴 | AC7(92개 테스트 green)에 의해 무효화 |

---

## Consequences (결과와 트레이드오프)

### 긍정적 영향

- **BioCom 3-step 완성**: 검사 → 상담 → 관리 프로그램(챌린지) 등록이 데이터로 닫힌다. 상담사는 `GET /challenges`로 전체 카탈로그를 보고, 상담 기록 생성 시 `challengeId`로 고객을 원자적으로 등록한다.
- **step-3 측정 가능**: Analytics가 `challengeEnrollments`(등록 수) + `challengeConversionRate`(구매→등록 전환율, `number|null`)를 노출한다. 전환율은 **record JOIN의 counselorId**로 범위를 산정해 기존 scope=own/all + counselorId 필터를 그대로 준수한다. `null`(구매 기록 0건)과 `0`(구매했으나 미등록)을 구분한다.
- **검사 결과 해석 UX**: 고객 결과 페이지가 지표별 참조범위 + 정상/주의/위험 상태 배지를 렌더한다.
- **92개 테스트 무회귀**: enum 동결 + JSONB superset + 4개 cascade FK가 `cleanupSeeded`를 무변경으로 유지한다. 신규 챌린지·지표 테스트는 92개 위에 **추가**된다(어떤 assertion도 전체 개수를 하드코딩하지 않음).
- **원자성 유지**: 등록은 `createRecord` 트랜잭션 안에서, 챌린지 존재 가드는 트랜잭션 진입 전에 실행되어 check-then-act 경쟁이나 트랜잭션 중간 실패가 없다.

### 트레이드오프 / 부정적 영향

- **serviceType DB 검증 부재**: 자유 문자열이므로 DB가 serviceType 유효성을 강제하지 않는다. 공유 `SERVICE_TYPES` 상수가 표류를 막는 유일한 가드다(seed-only/read-only라 런타임 미검증 쓰기 없음).
- **status/referenceRange 사전 계산**: 시드에 고정값으로 박혀 런타임 파생이 아니다. 검사 도메인이 read-only이므로 수용 가능하나, 실 업로드 파이프라인 도입 시 파서가 채워야 한다.
- **`counselorId` 비정규화**: `ChallengeEnrollment.counselorId`는 쿼리 편의·cascade FK용으로 중복 저장된다. Analytics는 **항상** record JOIN으로 범위를 산정해 단독 사용하지 않는다(쓰기 시점에는 record의 상담사 = 등록자이므로 양자가 일치).
- **등록 1회 고정**: `@@unique([recordId])`로 한 기록당 1건만 등록 가능하며, 등록 편집·상태 전이 UX는 의도적으로 범위 외다.

---

## Follow-ups (후속 과제 — Phase 2, 현 경계 유지)

- **등록 편집·상태 전이 UX**: `updateRecord`에서의 등록 편집과 `IN_PROGRESS → COMPLETED/DROPPED` 전이는 보류(범위 외). COMPLETED/DROPPED 전이가 상담사 UX 요구가 되면 재검토한다.
- **PURCHASED 게이팅**: 현재 코드는 outcome에 게이팅하지 않고 UI 컨벤션으로만 PURCHASED 경로에 Select를 노출한다. 서버 측 하드 규칙이 필요한지 확인 후 결정.
- **`linkedServiceType` 하드 필터화**: 현재 advisory(정렬/힌트). 카탈로그를 serviceType로 필터링해야 하는 요구가 생기면 하드 필터로 승격 검토.
- **별도 등록 엔드포인트**: 트랜잭션 결합이 문제되면 고립된 등록 write를 `POST /challenge-enrollments`로 분리(B2). 기록 경로 재작업 없이 가능.
