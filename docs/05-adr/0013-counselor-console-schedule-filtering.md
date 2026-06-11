# ADR 0013 — 상담사 콘솔 일정 가시성·필터·그룹핑

- **상태**: Accepted
- **날짜**: 2026-06-11
- **관련**: [0006 ops-hardening](./0006-ops-hardening.md)(NO_SHOW 단말 상태 도입), [0009 frontend-fsd-architecture](./0009-frontend-fsd-architecture.md)(슬라이스/세그먼트 컨벤션), [0012 frontend-types-constants-segments](./0012-frontend-types-constants-segments.md), [04-system-design §API](../04-system-design.md), [02-requirements AC-N6·AC-UX1](../02-requirements.md)

## 맥락

상담사 콘솔(`/schedule`, `/availability`)에 3가지 운용 페인이 보고되었다.

1. **NO_SHOW 비가시성**: `GET /counselor/schedule`이 `status IN (PENDING, CONFIRMED, COMPLETED)`만 반환하고 **`NO_SHOW`를 제외**했다. ops-hardening(ADR 0006)으로 `sweepNoShows`가 미방문 예약을 `NO_SHOW`로 전이하지만, 정작 상담사가 그 미방문 내역을 콘솔에서 볼 수 없었다. 출석 정정(`PATCH /attendance`)의 대상조차 일정에서 사라지는 모순.
2. **단일 평면 리스트**: `/schedule`은 제목이 "오늘의 상담 일정"이지만 실제로는 전체 예약을 startAt 오름차순 평면 리스트로 덤프했다. 오늘/특정 날짜만 보거나 상태별로 좁힐 수단이 없었다.
3. **가용 일정 평면 덤프**: `/availability`도 슬롯을 평면 리스트로 나열해, 날짜가 늘면 관리·조망이 어려웠다.

설계문서(이전 04-system-design)는 `GET /counselor/schedule`에 `?date=YYYY-MM-DD` 쿼리를 *예고*했으나 구현되지 않았다.

## 결정

**서버는 데이터 가시성만 책임지고, 기간·상태 필터와 날짜별 그룹핑은 클라이언트에서 순수 함수로 수행한다.**

- **NO_SHOW를 스케줄에 포함**: `getCounselorSchedule`의 상태 집합을 `{PENDING, CONFIRMED, COMPLETED, NO_SHOW}`로 확장한다. **`CANCELLED`만 제외** — 취소는 고객이 철회한, 실제로 일어나지 않은 세션이므로 콘솔 일정의 대상이 아니다.
- **클라이언트 2축 필터**: 기간(오늘/예정/지난/전체)과 예약상태(전체/예약중/예약완료/완료/노쇼)를 `SegmentedControl`로 제공한다. 상태 카운트는 현재 기간 스코프에 종속되어, 비어 있는 필터가 자기설명적이 되게 한다.
- **날짜별 그룹핑**: 살아남은 항목을 로컬 캘린더일 기준으로 그룹화하고 날짜 헤더(+건수)를 붙인다. 지난(past) 렌즈는 최근일 우선(내림차순), 그 외는 빠른일 우선(오름차순).
- **로직 분리·테스트**: 스코프/그룹 규칙을 `shared/lib/date`(`matchesScope`·`groupByDay`·`formatDayHeader`)에 두고, 슬라이스별 선택 로직을 `views/schedule/lib/filter`·`views/availability/lib/grouping`로 추출해 vitest 단위 테스트로 고정한다(React 렌더 불요).
- **가용 일정 동일 패턴**: `/availability`는 기간 필터(오늘/예정/전체) + 날짜별 그룹(예약가능/전체 카운트). 백엔드가 종료된 슬롯을 이미 제외(`findOwnSlots: endAt >= now`)하므로 지난(past) 렌즈는 제공하지 않는다.

## 대안

| 안 | 내용 | 기각 사유 |
|---|---|---|
| **A. 서버 `?date`/`?status` 쿼리** | 설계문서가 예고한 대로 백엔드에서 날짜·상태 필터링 | 콘솔 데이터셋은 상담사 1인 단위로 작고, 클라이언트가 이미 전량을 보유한다. 매 필터 전환마다 왕복하면 지연만 늘고 캐시 무효화가 복잡해진다. 순수 함수 필터는 즉시 반응 + 단위 테스트 용이. 서버 라운드트립은 데이터가 페이지네이션을 요구할 만큼 커질 때(Phase 2) 도입. |
| **B. 풀 캘린더(월 그리드) 위젯** | 달력 형태로 일정/슬롯 표시 | 현 카드-리스트 미감과 충돌하고 구현·접근성 비용이 과도하다. "보기 편하게"라는 요구에 대해 날짜별 그룹 리스트가 비례적. 캘린더는 필요 시 Phase 2. |
| **C. CANCELLED도 포함** | 모든 상태를 스케줄에 노출 | 취소는 일어나지 않은 세션이라 일정/출석의 대상이 아니다. 노이즈만 늘린다. 분석은 별도 Analytics 경로가 담당. |

## 결과

- **백엔드**: `consultation.service.getCounselorSchedule` 상태 집합에 `NO_SHOW` 추가(1줄 + 주석). `no-show-loop.spec.ts`에 스케줄 NO_SHOW 노출 assert 추가(AC-N6). 기존 `golden-path` e2e는 `bookingId`로 find하므로 불변.
- **프론트엔드**: `shared/lib/date`(+test) 신설. `views/schedule`에 `lib/filter`(+test)·`ui/ScheduleToolbar`·`ui/ScheduleDayGroup` 추가, `SchedulePage` 재구성. `views/availability`에 `constants`·`lib/grouping`(+test)·`ui/AvailabilityToolbar`·`ui/AvailabilityDayGroup` 추가, `AvailabilityPage` 재구성.
- **검증**: 프론트 vitest 14 files / 75 tests green, `tsc --noEmit` 0 errors(FE·BE), 백엔드 `no-show-loop` 12 tests green.
- **트레이드오프**: 필터/그룹핑이 클라이언트에 있어 데이터가 매우 커지면(수백 건+) 초기 페이로드가 비대해진다. 콘솔 단위 규모에서는 무시 가능하며, 페이지네이션이 필요해지는 시점에 서버 필터(대안 A)로 승격하는 경로를 열어 둔다.
