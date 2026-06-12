# ADR 0006: 상담 운영 하드닝 — 현존 모듈 확장 (Ops Hardening — Extend In Place)

- **상태**: 확정 (Accepted) · **개정(Amended) 2026-06-12** — 고객 대기열(waitlist/queue) 제거에 맞춰 waitlist 전환 루프·`waitlistConversionRate`를 본 ADR에서 철회
- **날짜**: 2026-06-10 (개정 2026-06-12)
- **결정자**: 설계자 (솔로 과제)

---

> **개정 노트 (2026-06-12)**: 본 ADR의 최초안은 네 개의 열린 루프(no-show · **waitlist 전환** · 운영 깔때기 Analytics · 슬롯 CRUD)를 닫는 것을 다뤘다. 이후 R4(만석 이탈)의 1차 대안을 **셀프서비스 가용 캘린더**로 명확히 하면서 **고객 대기열(waitlist/queue)을 reasoned Phase 2 Non-Goal로 제거**했다(근거: 03-mvp-scope §2.8 — limited counselor pool에서 가용 탐색이 더 높은 레버리지의 1차 해법, 대기열은 TTL/FIFO/promotion 복잡도 대비 MVP 가치 낮음). 따라서 아래 본문에서 **waitlist 전환 루프(루프 2)와 `waitlistConversionRate` 지표는 더 이상 적용되지 않으며**, 본 ADR이 확정하는 ops-hardening은 **no-show 스윕 + stale-pending 스윕 + 운영 깔때기 Analytics + 슬롯 CRUD**다. 취소는 promotion 없이 슬롯을 가용 목록에 즉시 재노출시킬 뿐이다.

## Context (결정 배경)

초기 MVP는 예약 생명주기를 `PENDING → CONFIRMED → COMPLETED / CANCELLED` 네 상태로 완성하지 않은 채 남겼다. 구체적으로 다음 세 루프가 열려 있었다(최초안의 "waitlist 전환 루프"는 위 개정 노트대로 철회됨).

1. **No-show 루프**: 상담사가 기록을 남기지 않은 채 슬롯이 종료되어도 상태가 `CONFIRMED`로 고착된다. `NO_SHOW` 상태가 없으므로 참석률·전환 깔때기 수치가 부정확하다.

2. **운영 깔때기 Analytics 공백**: `GET /admin/analytics`에 예약 상태별 수(`booked / confirmed / completed / noShow / cancelled`), `noShowRate`, `slotUtilization`가 없어 운영 현황 대시보드가 미완성이다.

3. **가용 슬롯 관리 인터페이스 부재**: 상담사·관리자가 API를 통해 `AvailabilitySlot`을 직접 생성·수정·삭제할 수 없다. seed 데이터 또는 직접 DB 조작에 의존한다.

이 세 루프를 닫는 방법으로 세 가지 옵션이 검토되었다.

---

## Decision (결정)

**옵션 A — 현존 모듈 확장(Extend In Place)을 채택한다.**

- `BookingStatus`에 `NO_SHOW` 값을 추가(additive enum 확장, 기존 행 영향 없음)한다.
- 취소(`CANCELLED`)는 해당 슬롯을 부분 unique 인덱스 조건(`status IN ('PENDING','CONFIRMED')`)에서 빼는 것으로 충분하다 — 슬롯이 가용 캘린더에 즉시 재노출되며, 별도의 promotion·통지 단계는 없다(만석 1차 대안 = 가용 캘린더; 고객 대기열은 Phase 2 Non-Goal).
- 스윕 로직(`sweepNoShows`, `sweepStalePending`)은 **도메인 서비스 메서드**에 두고, 얇은 타이머 전용 `OpsSchedulerService`(`@nestjs/schedule`)가 호출한다. 테스트는 메서드를 직접 호출한다(라이브 `@Interval` 비의존).
- DB 마이그레이션: `ALTER TYPE ... ADD VALUE IF NOT EXISTS`로 `BookingStatus`에 `NO_SHOW`를 추가한다(enum 전용, 같은 트랜잭션에서 신규 값 사용 불가라는 PostgreSQL 제약 준수). 슬롯 CRUD는 기존 테이블만 사용하므로 추가 컬럼이 없다.

---

## Alternatives Considered (검토된 대안)

| 옵션 | 장점 | 단점 | 비채택 이유 |
|------|------|------|------------|
| **A: 현존 모듈 확장 (채택)** | 최소 표면적; 검증된 패턴(스케줄러·RBAC·소유권·테스트 아일랜드) 재사용; 가장 빠른 green; 현 아키텍처와 정합 | 취소된 슬롯의 재노출은 고객이 가용 캘린더를 다시 조회해야 인지됨(능동 통지 없음 — 고객 대기열을 Phase 2 Non-Goal로 둔 결과) | — (채택) |
| **B: 고객 대기열(waitlist/queue) + `WaitlistOffer` 소프트 홀드** | 공석 발생 시 대기자에게 능동 통지·FIFO 승격 가능; 잔여 통지 수요(R8)를 포착 | `Waitlist`/`WaitlistOffer` 엔티티 + TTL/FIFO/promotion 상태기계 + 오퍼 만료/전환 추적 등 별도 서브시스템 필요; 마이그레이션·쿼리 표면 대폭 확대 | R4(만석 이탈)의 1차 대안은 이미 **셀프서비스 가용 캘린더**가 해소한다(03-mvp-scope §2.8). 대기열은 그 위의 잔여 수요이며 복잡도 대비 MVP 가치가 낮아 **reasoned Phase 2 Non-Goal로 제거**. 기각 |
| **C: 이벤트 소싱 예약 생명주기** | 완벽한 감사 가능성; 리플레이로 깔때기 산출 명확 | 대규모 아키텍처 전환; 기존 예약 읽기 경로 전면 재작성; 2주 예산 크게 초과 | Principle 1(검증된 패턴 재사용)·예산 동인(Driver 1) 위반. 기각 |

---

## Consequences (결과와 트레이드오프)

### 긍정적 영향

- **예약 생명주기 완성**: `PENDING → CONFIRMED → COMPLETED / NO_SHOW / CANCELLED` 경로가 닫힌다. `NO_SHOW`는 스케줄러 자동 전이(상태 가드 `updateMany`) + 상담사 수동 override(`PATCH /bookings/:id/attendance`) 두 경로를 가진다.
- **만석 1차 대안 = 가용 캘린더**: 취소된 슬롯은 부분 unique 인덱스 조건에서 빠져 가용 캘린더에 즉시 재노출되므로, 고객은 다른 일자·상담사 슬롯과 함께 이 슬롯을 직접 예약할 수 있다(promotion·통지 없는 셀프서비스 경로).
- **운영 깔때기 대시보드 완성**: `booked / confirmed / completed / noShow / cancelled` 카운트 + `noShowRate`, `slotUtilization` 두 비율이 기존 `scope=own|all / counselorId` 필터를 그대로 준수한다.
- **슬롯 CRUD 인터페이스**: 상담사는 본인 슬롯을, 관리자는 임의 슬롯을 생성·수정·삭제할 수 있다. 중첩 슬롯 409 가드·활성 예약 삭제 409 가드로 데이터 무결성을 보장한다.
- **DB 원자성 유지**: 예약 취소·생성 상태 전이는 동일 트랜잭션 내에서 원자적으로 실행된다. check-then-act 게이트는 전혀 없다.

### 트레이드오프 / 부정적 영향

- **능동 통지 부재(고객 대기열 미도입의 결과)**: 취소로 슬롯이 재노출되어도 고객에게 능동 통지가 가지 않는다 — 고객이 가용 캘린더를 다시 조회해야 인지한다. 이는 고객 대기열(공석 통지·FIFO 승격)을 reasoned Phase 2 Non-Goal로 둔 데서 나온 **의도적인** 설계 경계다(03-mvp-scope §2.8).
- **`NO_SHOW` 자동 전이 오분류 위험**: 상담이 실제로 이루어졌으나 상담사가 기록을 남기지 않은 경우 스케줄러가 자동으로 `NO_SHOW`로 전이한다. 이를 방지하기 위해 counselor override(`PATCH /bookings/:id/attendance`) 경로를 제공하며, "COMPLETED에는 기록이 있어야 한다"는 CRM 규율을 운영 지침으로 명시한다.
- **enum 비가역성**: `ADD VALUE IF NOT EXISTS`는 롤백이 불가능하다(백업에서 복원해야 함). 기존 마이그레이션들과 동일한 전향적(forward-only) 원칙을 적용한다.

---

## Follow-ups (후속 과제 — Phase 2, 현 경계 유지)

- **고객 대기열(waitlist/queue)**: "원하는 슬롯이 열리면 통지받고 FIFO로 승격"하는 잔여 통지 수요(R8). `Waitlist`/`WaitlistOffer` 엔티티 + TTL/FIFO/promotion 상태기계 + 공석 통지(`SLOT_OPENED` enum 재활성화) + 오퍼 만료/전환 추적이 필요하다. 가용 캘린더(R4 1차 대안)가 만석 1차 이탈을 막은 뒤의 잔여 수요이므로 reasoned Phase 2 Non-Goal로 둔다.
- **실 소프트 홀드**: 위 대기열 도입 시 `AvailabilitySlot.heldUntil` / `heldForWaitlistId` 컬럼 추가로 대기자가 오퍼를 받은 동안 해당 슬롯을 calendar에서 비노출. 단일 컬럼 추가로 구현 가능하다.
- **reschedule 플로우**: `CONFIRMED → RESCHEDULED → RE-CONFIRMED` 상태 전이 + 기존 슬롯 반환 + 새 슬롯 동시성 재보장. 복합 플로우이므로 `docs/04-system-design.md`에 상태 전이도를 설계 경계로 명시하고 구현은 Phase 2.
- **실 알림 어댑터**: `NotificationChannel` 인터페이스 기반 SMS·이메일 어댑터 구현 (현재 Console/InApp 실동작, Email/SMS stub). 외부 계정 없음 동인이 해소되는 시점에 교체.
- **Analytics 사전집계(pre-aggregation)**: 데이터 규모 증가 시 실시간 집계 쿼리를 집계 테이블 + 증분 갱신 패턴으로 전환.
