# Allosta — BioCom 상담 예약·전환 분석 플랫폼

BioCom(검사 → 상담 → **관리 프로그램(챌린지)**의 3-step) 검사 결과를 받은 고객(및 가족 검사결과 대리 상담자)이
**상담사 가용 시간을 직접 예약**하고, 상담사는 **논의한 검사 지표에 귀속된 구조화 상담 기록**을 남기고
구매 전환 시 **관리 프로그램(챌린지)에 등록**하며, 관리자는 **전환율·상품/지표별 관심도·챌린지 등록 전환율을
실시간 집계**해 보는 셀프서비스 플랫폼입니다.

상담사 생산성을 높이는 **사전 브리핑 + 상담 전 AI 가이던스** 기능이 포함됩니다. AI 가이던스는 다가오는 상담을
**어떻게 진행할지** 대상자의 검사 지표·과거 상담 기록(+`concern`)에서 파생해 미리 안내합니다(사후 요약이 아님).
로컬 Ollama 없이도 항상 결정론 FALLBACK 텍스트로 제공되며, Ollama+모델이 있으면 ~1 스윕 사이클 내에 자동으로 UPGRADED로 교체됩니다.

> **과제 성격**: 2주 평가용 take-home. 1차 산출물은 **설계 문서**이며, 구현은 golden path
> (예약 → 상담사 확정 → 상담 기록 + 챌린지 등록 → 전환 집계) 1개를 **동작·테스트로 증명**하는 보조 증거입니다.
> **외부 계정·API 키가 전혀 필요 없습니다** — `docker compose up` + seed 만으로 로컬에서 끝까지 재현됩니다.

---

## 1. 산출물 매핑 (6종)

| #   | 과제 산출물          | 위치                                                                                                                                |
| --- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 문제 정의            | [`docs/01-problem-definition.md`](docs/01-problem-definition.md) (근본원인 R1~R9 분석 포함 — R9=BioCom step-3)                      |
| 2   | 요구사항 목록        | [`docs/02-requirements.md`](docs/02-requirements.md) (FR/NFR + 수용기준 AC1~AC11 + ops-hardening AC-N/W/A/S + BioCom AC-C/M 시리즈) |
| 3   | MVP 범위 + 근거      | [`docs/03-mvp-scope.md`](docs/03-mvp-scope.md) (6컴포넌트 차등 깊이 + Non-goal 근거)                                                |
| 4   | **시스템 설계 문서** | [`docs/04-system-design.md`](docs/04-system-design.md) (ERD·아키텍처·시퀀스·API·동시성) + [`docs/05-adr/`](docs/05-adr/) ADR 15종   |
| 5   | 구현 결과물          | [`backend/`](backend/) (NestJS) · [`frontend/`](frontend/) (Next.js)                                                                |
| 6   | README               | 본 문서                                                                                                                             |

---

## 2. 아키텍처 한눈에

```
Next.js App Router (:5173)
  ├── Middleware (src/middleware.ts) — 서버측 역할 기반 라우트 보호 (JWT 서명+만료 검증, jose HS256 → 미인증/위조/만료 307 /login, 역할 불일치 본인 홈)
  ├── /api/proxy/** — httpOnly 쿠키 → Authorization 헤더 변환 후 NestJS 전달
  └── (customer) · (counselor) · (admin) 라우트 그룹
          │
          │ HTTP/JWT (Bearer)
          ▼
NestJS (:3000) ──Prisma──▶ PostgreSQL (:5432, docker)
  ├── Auth/RBAC (역할 Guard) + Ownership (자원 소유권, 서비스 레이어 — 본인 OR ACCEPTED FamilyLink 파트너)
  ├── Booking (PENDING-first → 상담사 confirm → CONFIRMED/CANCELLED/COMPLETED/NO_SHOW)
  │     └── 출석 정정 (PATCH /bookings/:id/attendance — 상담사 override + no-show 스윕)
  ├── Availability (파생값 — isOpen AND 미래 AND ACTIVE 없음 AND 업무시간)
  │     ├── availability-calendar (시간대 집계, availableCount — 만석 시 다른 일자·상담사 1차 대안 노출)
  │     └── 슬롯 CRUD (상담사 본인 + 관리자 전체; 겹침 가드 + 활성예약 삭제 가드)
  ├── Family (대칭형 FamilyLink Customer↔Customer 초대 코드 — PENDING/ACCEPTED/REVOKED)
  ├── TestResult (seed + read-only, BioCom 7종 + 지표 참조범위/상태, GET /test-results/my = 본인 + ACCEPTED 가족)
  ├── Consultation · Challenge (상담기록 + 챌린지 카탈로그/등록, createRecord 원자 등록 — BioCom step-3)
  │     ├── 브리핑 조립 (GET /counselor/bookings/:id/brief — 결정론, briefOpenedAt 1회 기록)
  │     └── GuidanceModule (브리핑 열람 시 FALLBACK 가이던스 보장 → OpsScheduler 스윕으로 UPGRADED)
  ├── Analytics (scope 토글: own/all + 운영 퍼널/지표 + 챌린지 등록 수/전환율 + briefOpenRate)
  └── Notification (시뮬) — @nestjs/schedule
        └── Channel 어댑터: Console·In-App(실동작) / Email·SMS(stub)
```

**핵심 설계 결정 요약:**

- **예약 생명주기**: `PENDING`(고객 생성) → `CONFIRMED`(상담사 확정) → `COMPLETED`/`CANCELLED`.
- **가용성**: 파생값. `isOpen AND 미래 AND ACTIVE 없음 AND 업무시간[9,18)`. 이중 진실원 없음.
- **TestResult 기반 subject**: 예약 시 `testResultId` 지정 → 서버가 `subjectType/subjectId` 파생. 클라이언트 오지정 방지.
- **가족 연결**: 대칭형 `FamilyLink`(Customer↔Customer) 초대 코드(PENDING→ACCEPTED→REVOKED). 예약 subject는 항상 `CUSTOMER`이고 `subjectId`는 본인 또는 `ACCEPTED` 가족 파트너가 소유한 검사결과의 고객. `GET /test-results/my`는 ACCEPTED 가족 검사결과 포함.
- **outcome 3상태**: `EXPLAINED` / `GUIDED` / `PURCHASED` (구버전 ON_HOLD·REJECTED에서 변경).
- **권한 2층**: 역할(RBAC Guard) + 자원 소유권(서비스 레이어 — 본인 OR `ACCEPTED` FamilyLink 파트너).
- **운영 강건화 (ops-hardening, ADR 0006)**:
  - **No-show**: 슬롯 종료 후 `CONFIRMED` 예약을 `sweepNoShows`가 `NO_SHOW`로 자동 전이(상태 가드 멱등) + 상담사 수동 override(`PATCH /bookings/:id/attendance` → COMPLETED/NO_SHOW, 본인 담당만; 관리자는 전체).
  - **만석 1차 대안 = 가용 캘린더**: 만석 시 고객은 가용 캘린더에서 다른 일자·상담사 슬롯을 직접 예약하고, 취소된 슬롯은 즉시 가용 목록에 재노출된다(promotion·통지 없음). 고객 대기열(waitlist/queue)은 reasoned Phase 2 Non-Goal(설계 근거: `docs/03-mvp-scope.md` §2.8).
  - **운영 퍼널 Analytics**: `GET /admin/analytics`에 `funnel{booked,confirmed,completed,noShow,cancelled}` + `noShowRate` + `slotUtilization` 추가.
  - **가용 슬롯 CRUD**: 상담사 본인 + 관리자 전체. 겹침 가드 + 활성 예약이 걸린 슬롯 삭제 가드.
  - **OpsScheduler**: 타이밍만 소유하는 `@Interval` 래퍼(`ops-scheduler/`). 도메인 로직은 각 서비스 메서드에 위치, 테스트는 도메인 메서드를 직접 호출.
- **BioCom step-3 (챌린지 등록, ADR 0007)**:
  - **Challenge 카탈로그**: 시드 관리 카탈로그(`GET /challenges`). `linkedServiceType`은 advisory(정렬/힌트), 전체 목록 제공.
  - **ChallengeEnrollment**: 상담 기록 생성(`POST /consultation-records { ..., challengeId? }`) 트랜잭션 안에서 원자적 등록. 존재하지 않는 `challengeId`는 트랜잭션 진입 전 가드로 404. `updateRecord`는 등록 미변경. 4개 FK 전부 `onDelete: Cascade` + `@@unique([recordId])`.
  - **챌린지 Analytics**: `challengeEnrollments`(등록 수) + `challengeConversionRate`(구매→등록 전환율, `number|null` — null=구매 0건, 0=구매했으나 미등록). record JOIN으로 scope 토글 준수.
  - **검사 도메인**: `serviceType` 자유 문자열 + 공유 `SERVICE_TYPES` 상수(7종). metrics JSONB에 `referenceRange`/`status(정상/주의/위험)` additive 확장 → 결과 페이지에 참조범위 컬럼 + 상태 배지.
  - **검사 결과서 그룹핑(표시 전용, ADR 0008)**: 개별 `TestResult`(serviceType 1종/row)를 **(subjectId + 검사일) 단위 "검사 결과서"**로 프론트에서 묶는다(`lib/reports.ts`, 순수 함수 + 단위 테스트). 검사결과 화면은 **`내 검사`/`연동 계정` 서브탭**으로 본인·가족을 분리하고, 예약·내 예약은 결과서 단위 + `SERVICE_TYPE_LABELS` 친화 라벨로 표현(내 예약은 단일 검사명이 아닌 결과서 전체 검사 목록 표시). 스키마/API 무변경(`Booking.testResultId`는 subject 앵커이므로 대표 결과 id 전송으로 충분).
  - **고객·상담사 동일 결과 레이아웃**: 공용 `ResultSection`(`@/entities/test-result` — 항목/수치/참조범위/판정 배지 + 친화 라벨)을 고객 검사결과 화면과 상담사 기록 폼이 공유한다. 상담사 폼은 동일 표에 지표 선택 체크박스 컬럼만 더해 `metricRefs` 연계를 유지.
- **상담 준비·생산성 자동화 (ADR 0014)**:
  - **사전 브리핑**: `GET /counselor/bookings/:bookingId/brief` (`@Roles COUNSELOR`, 소유권 검증) — TestResult 지표(`metricKey` asc, 이상 플래그) + 과거 ConsultationRecord(`createdAt` desc) + ACCEPTED FamilyLink 맥락 + `concern`을 서버가 결정론 조립. 최초 열람 시 `briefOpenedAt`을 조건부 `updateMany`로 1회 기록(DB 레이어 멱등).
  - **고객 concern**: 예약 생성 시 선택적 사전질문(`@MaxLength(1000)`). 브리핑에만 기록하고 고객 API로 반환하지 않는다(write-only).
  - **상담 전 AI 가이던스 생명주기**: 다가오는 상담을 어떻게 진행할지에 대한 가이던스를 예약 단위 `ConsultationBriefGuidance`(bookingId-keyed, `Booking` 1:1 cascade)에 보관한다(사후 요약 아님). 브리핑을 열면 `GuidanceService.ensureFallbackForBooking`이 결정론 템플릿 가이던스를 `status=FALLBACK`으로 보장한다(Ollama 의존 없음, `createRecord`는 가이던스를 건드리지 않음). OpsScheduler `@Interval` `sweepPendingUpgrades()`가 `status=FALLBACK` 행만 Ollama로 업그레이드 → `UPGRADED`로만 업서트(절대 downgrade 없음, 멱등, 수동 트리거 없음).
  - **Ollama 옵트인**: Ollama 없이도 golden path는 항상 통과(FALLBACK이 기본). Ollama 설치 후 `ollama pull gemma4:e4b`를 실행하면 ~1 스윕 사이클 내에 가이던스가 자동으로 UPGRADED로 교체된다(별도 버튼·수동 트리거 불요). 환경 변수 미설정 시 기본값(`OLLAMA_BASE_URL=http://localhost:11434`, `SUMMARY_MODEL=gemma4:e4b`) 사용, startup assertion 없음.
  - **Analytics**: `briefOpenRate`(분모=CONFIRMED+COMPLETED+NO_SHOW)를 headline 생산성 지표로 유지. 기존 scope 토글 준수.
- **프론트엔드**: Next.js 14 App Router. JWT는 httpOnly 쿠키에 격리 — 클라이언트 JS 미노출. **서버측 접근제어**: `src/middleware.ts`가 보호 라우트 그룹 진입 전 쿠키 JWT의 서명+만료를 `jose`(HS256, 백엔드와 동일 `JWT_SECRET`)로 검증한다 — 백엔드 RBAC+소유권과 함께 방어 심층화(ADR 0010).
- **프론트엔드 스타일·상태·데이터(ADR 0011)**: **Tailwind를 Radix Themes 위에 레이어링** — 색/반경을 Radix 런타임 CSS 변수에 매핑(`text-teal-11` → `var(--teal-11)`, 값 중복 0·테마 자동 추종), preflight OFF, 반복 토큰은 `shared/ui` 프리미티브(`Eyebrow`·`StatNumber`·`Meter`)로 통일. 상태는 **서버=TanStack Query / 클라이언트=Jotai**. 데이터 패칭 훅은 entity별 `api/queries.ts`(queryKey 팩토리 + `useX()`/`useXMutation()`)로 모으고 뷰는 인라인 `useQuery` 대신 슬라이스 훅을 소비.

자세한 근거는 [설계문서](docs/04-system-design.md) · [ADR](docs/05-adr/) 참고.

---

## 3. 사전 요건

- **Docker** + Docker Compose (PostgreSQL 컨테이너용)
- **Node.js ≥ 20**, **pnpm ≥ 9**

그 외 외부 계정/키는 **불필요**합니다.

---

## 4. 빠른 시작 (Golden Path 재현)

### 4-1. PostgreSQL 기동 (레포 루트에서)

```bash
docker compose up -d        # postgres:16, localhost:5432, db/user/pw = allosta
```

### 4-2. 백엔드

```bash
cd backend
cp .env.example .env        # 기본값으로 바로 동작
pnpm install
pnpm prisma:generate        # Prisma Client 생성
pnpm prisma:migrate         # 마이그레이션 적용 (부분 unique 인덱스 포함)
pnpm seed                   # 데모 데이터 적재
pnpm start:dev              # http://localhost:3000  (프로덕션: pnpm build && pnpm start:prod)
```

- **Swagger API 문서**: <http://localhost:3000/api/docs>

### 4-3. 프론트엔드

```bash
cd frontend
cp .env.example .env.local  # 기본값으로 바로 동작 (JWT_SECRET이 backend/.env와 동일해야 함)
pnpm install
pnpm dev                    # http://localhost:5173
```

- **`JWT_SECRET`**: 미들웨어가 세션 쿠키 JWT의 서명을 검증할 때 쓰며 **백엔드 `JWT_SECRET`과 반드시 일치**해야 한다(`backend/.env`·`frontend/.env` 기본값 모두 `dev-only-change-me-in-production`). 불일치 시 로그인 후 미들웨어 검증 실패로 `/login`으로 되튕긴다. 서버측 전용 — 클라이언트 번들에 노출되지 않는다.
- **품질 게이트**: `pnpm typecheck` · `pnpm lint`(`next lint`) · `pnpm test`(vitest) · `pnpm build`.

---

## 5. 시드 계정

| 역할                 | 이메일                | 비밀번호   | 비고                                                                         |
| -------------------- | --------------------- | ---------- | ---------------------------------------------------------------------------- |
| 고객 (CUSTOMER)      | `customer@demo.com`   | `demo1234` | TestResult 2건 · `family@demo.com`과 ACCEPTED FamilyLink 연결                |
| 상담사 1 (COUNSELOR) | `counselor@demo.com`  | `demo1234` | 슬롯 그리드 공유                                                             |
| 상담사 2 (COUNSELOR) | `counselor2@demo.com` | `demo1234` | 슬롯 그리드 공유                                                             |
| 관리자 (ADMIN)       | `admin@demo.com`      | `demo1234` | —                                                                            |
| 가족 계정 (CUSTOMER) | `family@demo.com`     | `demo1234` | `customer@demo.com`과 ACCEPTED FamilyLink로 대칭 연결 — 서로의 검사결과 접근 |

시드 슬롯: **2026년 6–8월, 월–금, 09:00–18:00 매 시간**, 두 상담사 공통 생성.
동일 시간대에 두 상담사 모두 가용할 경우 `availableCount=2`로 캘린더에 표시됩니다.

### 시드 BioCom 데이터

- **검사결과(TestResult)**: BioCom 7종(대사 6종·음식물 과민·스트레스/노화·영양/중금속·장내 미생물·호르몬·펫 영양). 각 지표에 `referenceRange` + `status(정상/주의/위험)` 포함. `customer@demo.com`이 보유(대사 6종 결과가 데모 골든패스의 고정 subject).
- **상품(Product)**: BioCom 보충제 라인 6종(메타밸런스 대사케어·슬립리커버 수면지원·더마글로우 피부영양·글루코세이프 혈당관리·거트바이옴 장건강·오메가케어 혈행개선).
- **챌린지(Challenge)**: 관리 프로그램 카탈로그 4종(대사 리셋 12주·장건강 회복 8주·스트레스 케어 8주·호르몬 밸런스).
- **데모 등록(ChallengeEnrollment)**: 과거 종료 슬롯의 COMPLETED 예약 + PURCHASED 기록이 `customer@demo.com`을 "대사 리셋 12주 챌린지"에 1건 등록 → 관리자 대시보드의 챌린지 등록 수·전환율이 비어 있지 않게 표시됩니다.

---

## 6. Golden Path 클릭 시나리오

1. **고객**으로 로그인 → `/book` 슬롯 예약 화면.
   - **검사 결과서 선택**(본인/연동 계정 단위) → 예약 대상 결과서를 지정 (상담 대상이 자동으로 결정됨; 대표 TestResult가 subject 앵커).
   - 통합 캘린더에서 시간대 선택 → 예약 생성 → `status=PENDING`. **CONFIRMATION 알림** 생성.
   - (원하는 시간대가 만석이면 **통합 캘린더에서 다른 일자·상담사의 빈 슬롯**(`availableCount`)을 직접 골라 예약 — 만석 이탈의 1차 대안. 고객 대기열은 Phase 2 Non-Goal.)
2. **상담사**로 로그인 → `/schedule` 본인 일정 확인 → 예약 **확정** (`PENDING → CONFIRMED`).
   - **일정 필터·그룹핑**: 상단 2축 필터로 기간(오늘/예정/지난/전체)·예약상태(전체/예약중/예약완료/완료/**노쇼**)를 좁혀 보고, 날짜별 섹션(헤더+건수)으로 그룹핑되어 표시된다. 노쇼(`NO_SHOW`) 상담도 일정에 노출되어 미방문 내역을 검토할 수 있다.
   - **브리핑 패널**: 예약 상세에서 브리핑 패널을 열면 검사 지표(이상 플래그 포함)·과거 상담기록·가족 맥락·고객 `concern`이 자동 조립되고, 다가오는 상담을 어떻게 진행할지에 대한 **상담 전 AI 가이던스(FALLBACK)**가 함께 표시된다(Ollama+모델이 있으면 ~1 스윕 사이클 내 자동 UPGRADED 배지). 최초 열람 시각(`briefOpenedAt`)이 기록되며 브리핑 열람률 지표의 분자가 된다.
   - 확정된 예약에 **상담 기록** 입력: 주요 상담 내용(`summary`)·권고 사항(`recommendation`)·후속 조치(`followUp`) 구조화 슬롯 + 상담행위 체크리스트(`actions`) + 관심 상품(다중) + outcome(`EXPLAINED`/`GUIDED`/`PURCHASED`) + 논의 검사 지표(`metricRefs`) + **관리 프로그램(챌린지) 등록**(선택 `challengeId` — PURCHASED 경로에서 Select 노출, 전체 카탈로그에서 선택).
   - **출석 정정**: 슬롯 종료 후 노출되는 정정 버튼으로 `COMPLETED`/`NO_SHOW` 수동 override(미정정 `CONFIRMED`는 스케줄러가 자동 `NO_SHOW` 처리).
   - **가용 일정 관리**: `/availability`에서 본인 슬롯 생성/수정/삭제(겹침·활성예약 삭제 가드). 슬롯은 기간 필터(오늘/예정/전체) + **날짜별 그룹**(예약가능/전체 카운트)으로 정리되어 한눈에 관리할 수 있다.
3. **고객**(또는 가족 계정)으로 다시 로그인 → 원하던 시간대가 만석이었다면 `/book` 통합 캘린더에서 **다른 일자·상담사의 빈 슬롯**을 직접 골라 예약. 누군가 예약을 취소하면 그 슬롯이 캘린더에 즉시 재노출되어 그대로 예약할 수 있다(능동 통지는 없음 — 고객 대기열은 Phase 2 Non-Goal). 본인 예약은 `/bookings`에서 **예약 취소** 가능.
4. **관리자**로 로그인 → `/dashboard` → 전환율·outcome 분포·상품별 관심·**지표별 전환**(영문 `metricKey`를 `공복혈당` 등 한글 라벨로 표시)에 더해 **운영 퍼널 카드**(booked/confirmed/completed/noShow/cancelled), **운영 지표 카드**(noShowRate·slotUtilization), **챌린지 카드**(등록 수 + 등록 전환율 — null=구매 0건이면 "—", 0이면 "0%"), **브리핑 생산성 카드**(briefOpenRate)가 실시간 집계로 표시.

> **고객 결과 페이지(`/results`)**: 각 검사 지표가 값·단위와 함께 **참조범위 컬럼**과 **상태 배지**(정상=teal/주의=amber/위험=red)로 표시됩니다(BioCom 7종 결과 해석 UX).

### 알림 시연

리마인더는 시드된 가까운 미래 슬롯과 `REMINDER_LEAD_MINUTES`(기본 30, `.env`로 조정)로 자연 발화합니다.
스케줄러가 5초 간격으로 PENDING 알림을 디스패치합니다. 즉시 확인하려면:

```bash
# 백엔드 루트에서
pnpm exec ts-node scripts/trigger-scheduler.ts
# 또는 관리자 JWT로 API 호출
curl -X POST http://localhost:3000/admin/notifications/dispatch \
  -H "Authorization: Bearer <ADMIN_JWT>"
```

---

## 7. 테스트 (설계 증명)

```bash
cd backend
pnpm exec jest --config ./test/jest-e2e.json --runInBand
```


| 파일                               | 검증 항목                                                                                                                                   | 핵심 AC                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `booking.concurrency.spec.ts`      | 동일 슬롯 20개 동시 예약 → **정확히 1건 201 / 19건 409**, DB ACTIVE count=1                                                                 | AC2                                  |
| `rbac.spec.ts`                     | 역할 거부(고객→admin 403, 미인증 401) + 소유권 거부(타인 TestResult 403, 비담당 기록 403)                                                   | AC7, AC7b                            |
| `golden-path.e2e-spec.ts`          | 예약→확정→기록(+챌린지 등록)→집계 흐름 + 지표별 전환(AC9) + 상태 배지 가시성 + 챌린지 등록/전환 셀 + 만석 시 가용 캘린더 대안(AC10)         | AC1, AC4, AC6, AC9, AC10, AC-C, AC-M |
| `booking-redesign.spec.ts`         | PENDING-first 생명주기, confirm 엔드포인트                                                                                                  | AC1, AC3                             |
| `family.spec.ts`                   | 대칭형 `FamilyLink` 초대 코드 생성/수락/철회, ACCEPTED 파트너 검사결과 접근                                                                 | FR9                                  |
| `analytics.scope.spec.ts`          | scope=own/all 범위 분리, counselorId 필터                                                                                                   | AC11                                 |
| `no-show-loop.spec.ts`             | `sweepNoShows` 자동 NO_SHOW 전이(상태 가드·멱등), 상담사/관리자 attendance override, NO_SHOW 단말성, **스케줄에 NO_SHOW 노출**(콘솔 가시성) | AC-N2, AC-N4, AC-N5, AC-N6           |
| `availability.crud.spec.ts`        | 슬롯 생성/수정/삭제(상담사 본인 + 관리자 전체), 겹침 가드, 활성 예약 삭제 가드                                                              | AC-S1, AC-S2, AC-S3, AC-S4, AC-S5    |
| `availability.aggregation.spec.ts` | availability-calendar 시간대 집계(availableCount), 파생 가용성 규칙                                                                         | AC8                                  |

> 브라우저 E2E(Playwright)는 의도적으로 제외했습니다(설계문서 중심 과제에서 setup 비용↑·신호↓).
> 골든패스 증명은 백엔드 통합 테스트 + 본 README 워크스루로 대체합니다.

---

## 8. 프로젝트 구조

```
allosta/
├── docker-compose.yml              # PostgreSQL 16
├── docs/                           # 산출물 #1~#4
│   ├── 01-problem-definition.md
│   ├── 02-requirements.md
│   ├── 03-mvp-scope.md
│   ├── 04-system-design.md
│   └── 05-adr/                     # ADR 0001~0014
├── backend/                        # NestJS + Prisma
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/             # init · partial_unique · add_family_link · pending_completed ·
│   │   │                           # booking_pending_first · rename_outcome_states ·
│   │   │                           # symmetric_family_link · ops_enum_add ·
│   │   │                           # add_challenge · structured_consultation_record
│   │   └── seed.ts                 # 슬롯 그리드 (2026 Jun–Aug, Mon–Fri, 09–18) + ACCEPTED FamilyLink +
│   │                               # BioCom 7종 TestResult(참조범위/상태) + 상품 + 챌린지 카탈로그 + 데모 등록
│   ├── src/
│   │   ├── auth/                   # JWT Strategy, RolesGuard
│   │   ├── common/                 # ownership service, decorators
│   │   ├── booking/                # PENDING-first, confirm, concurrency, attendance, no-show 스윕
│   │   ├── availability/           # 파생값, availability-calendar, 슬롯 CRUD
│   │   ├── family/                 # 대칭형 FamilyLink 초대 코드
│   │   ├── consultation/           # 구조화 기록, metricRefs, 챌린지 카탈로그/등록 (createRecord 원자)
│   │   │   ├── guidance/           # GuidanceModule — TemplateGuidance, OllamaGuidance, GuidanceService
│   │   │   └── brief (getBookingBrief — 결정론 조립, briefOpenedAt 멱등 기록 + FALLBACK 가이던스 보장)
│   │   ├── analytics/              # 전환 집계, scope 토글, 운영 퍼널/지표, 챌린지 등록 수/전환율, briefOpenRate
│   │   ├── test-result/            # seed + read-only, /my 엔드포인트 (BioCom 7종 + 참조범위/상태)
│   │   ├── common/constants/       # SERVICE_TYPES 공유 상수 (BioCom 7종 코드)
│   │   ├── notification/           # 채널 어댑터, 스케줄러
│   │   └── customer/
│   ├── scripts/trigger-scheduler.ts
│   └── test/
│       ├── booking.concurrency.spec.ts
│       ├── booking-redesign.spec.ts
│       ├── rbac.spec.ts
│       ├── golden-path.e2e-spec.ts
│       ├── family.spec.ts
│       ├── analytics.scope.spec.ts
│       ├── no-show-loop.spec.ts
│       ├── analytics-ops.spec.ts
│       ├── availability.crud.spec.ts
│       ├── availability.aggregation.spec.ts
│       ├── challenge-enrollment.spec.ts      # BioCom: 챌린지 등록(원자·소유권·404·@@unique)
│       ├── analytics-challenge.spec.ts       # BioCom: 챌린지 등록 수/전환율(record JOIN 범위)
│       ├── test-result-metrics.spec.ts       # BioCom: 지표 참조범위/상태 노출
│       └── cascade-cleanup.spec.ts           # BioCom: cleanupSeeded cascade 무orphan
└── frontend/                       # Next.js 14 App Router · FSD(ADR 0009, types/constants 세그먼트 0012) · Tailwind on Radix + Jotai(ADR 0011)
    ├── tailwind.config.ts          # 색/반경을 Radix 런타임 CSS 변수에 매핑 · preflight OFF (ADR 0011)
    └── src/
        ├── middleware.ts           # 서버측 접근제어 (역할 라우트 가드 · JWT 서명 검증, ADR 0010)
        ├── app/                    # 얇은 Next 라우팅 + FSD app 레이어 (providers: TanStack Query + Jotai)
        │   ├── (customer)/book (결과서 단위 선택 · 만석 시 다른 일자·상담사 슬롯 직접 선택) · bookings (예약 취소 · 친화 라벨) · results (내 검사/연동 계정 서브탭 · 결과서 그룹핑 · 참조범위 컬럼 + 상태 배지)
        │   ├── (counselor)/schedule (출석 정정/no-show · 상담기록 폼 챌린지 Select) · availability (슬롯 CRUD) · performance
        │   ├── (admin)/dashboard (운영 퍼널/지표 카드 + 챌린지 등록 수/전환율 카드)
        │   ├── login/ · providers.tsx · layout.tsx
        │   └── api/auth · proxy/[...path]   # 각 page.tsx는 @/views/<route> 재노출
        ├── views/                  # 라우트별 페이지 컴포지션 (FSD "pages" 레이어)
        ├── widgets/                # 교차 도메인 복합 UI (app-shell, notification-bell)
        ├── features/               # 사용자 액션 (예약·상담기록·가족연동)
        ├── entities/               # 13개 도메인 슬라이스 (types · constants · api: fetcher+queries.ts 훅 · ui) — 타입/상수 세그먼트 분리(ADR 0012). consultation-brief 슬라이스 추가(브리핑 타입·API·상담 전 가이던스 FALLBACK/UPGRADED 배지)
        └── shared/                 # 도메인 무관 (ui: Tailwind 프리미티브 Eyebrow·StatNumber·Meter·tone · api·auth·config·lib/format)
```

---

## 9. 주요 스키마 마이그레이션 이력

| 마이그레이션                                  | 변경 내용                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`                                        | 기본 스키마 (User, Customer, Counselor, Booking, ConsultationRecord 등)                                                                                                                                                                                                                                                                                                                                                                             |
| `booking_partial_unique`                      | `booking_slot_active_unique` 인덱스 (`WHERE status='CONFIRMED'`) 초기 생성                                                                                                                                                                                                                                                                                                                                                                          |
| `add_family_link`                             | `FamilyLink` 모델(초대 코드 기반) 최초 추가                                                                                                                                                                                                                                                                                                                                                                                                         |
| `booking_status_pending_completed`            | `BookingStatus` enum에 `PENDING`, `COMPLETED` 추가                                                                                                                                                                                                                                                                                                                                                                                                  |
| `booking_pending_first`                       | 인덱스 조건 확장: `WHERE status IN ('PENDING','CONFIRMED')`                                                                                                                                                                                                                                                                                                                                                                                         |
| `rename_outcome_states`                       | `Outcome` enum: `ON_HOLD→GUIDED`, `REJECTED→EXPLAINED` (3상태 재정의)                                                                                                                                                                                                                                                                                                                                                                               |
| `symmetric_family_link`                       | `FamilyLink`를 대칭형(Customer↔Customer)으로 재설계: `inviterCustomerId`/`inviteeCustomerId`, `customerLowId`/`customerHighId` 정규화 쌍 + `relation*` 라벨, ACCEPTED 쌍 partial unique 인덱스. (`FamilyMember` 모델 제거)                                                                                                                                                                                                                          |
| `ops_enum_add`                                | `BookingStatus`에 `NO_SHOW` 추가 (no-show 루프). `Notification.type`의 `SLOT_OPENED` 값은 reserved/미사용 — 고객 대기열(Phase 2 Non-Goal) 도입 시 활성화                                                                                                                                                                                                                                                                                            |
| `add_challenge`                               | **BioCom step-3** — `ChallengeEnrollmentStatus` enum + `Challenge`(시드 카탈로그)·`ChallengeEnrollment`(4 FK 전부 cascade + `@@unique([recordId])`) 테이블 추가. 순수 additive(기존 테이블 `ALTER` 없음)로 기존 테스트 전량 무회귀(ADR 0007).                                                                                                                                                                                                       |
| `structured_consultation_record`              | 상담 기록을 구조화 — `notes` 단일 필드를 `summary`/`recommendation`/`followUp` 3슬롯으로 분리하고 `ConsultationActionType` 체크리스트(`actions[]`) 추가. 상담사 간 기록 일관성 강제 + 상담행위별 전환 분석 가능.                                                                                                                                                                                                                                    |
| `20260612120000_ai_pre_consultation_guidance` | **상담 전 AI 가이던스** — `Booking.concern String?`(고객 사전질문, write-only) + `Booking.briefOpenedAt DateTime?`(브리핑 최초 열람 시각) 추가. `ConsultationBriefGuidance`(`id, bookingId @unique, status BriefGuidanceStatus @default(FALLBACK), model String?, content, createdAt, updatedAt`) 신규 모델 + `BriefGuidanceStatus { FALLBACK UPGRADED }` enum + `Booking` 1:1 `onDelete: Cascade` 관계. 다가오는 상담 진행 안내를 예약 단위로 보관(사후 요약 아님). 순수 additive — 기존 테이블 ALTER 없음. |
