# ADR 0006: 상담 운영 하드닝 — 현존 모듈 확장 (Ops Hardening — Extend In Place)

- **상태**: 확정 (Accepted)
- **날짜**: 2026-06-10
- **결정자**: 설계자 (솔로 과제)

---

## Context (결정 배경)

초기 MVP는 예약 생명주기를 `PENDING → CONFIRMED → COMPLETED / CANCELLED` 네 상태로 완성하지 않은 채 남겼다. 구체적으로 다음 네 루프가 열려 있었다.

1. **No-show 루프**: 상담사가 기록을 남기지 않은 채 슬롯이 종료되어도 상태가 `CONFIRMED`로 고착된다. `NO_SHOW` 상태가 없으므로 참석률·전환 깔때기 수치가 부정확하다.

2. **Waitlist 전환 루프**: 공석 발생 시 대기자에게 `SLOT_OPENED` 알림은 전송하지만, 대기자가 실제로 예약을 완료했는지(`CONVERTED`)·알림이 만료되었는지(`EXPIRED`) 추적하지 않는다. "알림이 예약 전환에 기여했는가"를 측정할 수 없다.

3. **운영 깔때기 Analytics 공백**: `GET /admin/analytics`에 예약 상태별 수(`booked / confirmed / completed / noShow / cancelled`), `noShowRate`, `slotUtilization`, `waitlistConversionRate`가 없어 운영 현황 대시보드가 미완성이다.

4. **가용 슬롯 관리 인터페이스 부재**: 상담사·관리자가 API를 통해 `AvailabilitySlot`을 직접 생성·수정·삭제할 수 없다. seed 데이터 또는 직접 DB 조작에 의존한다.

이 네 루프를 닫는 방법으로 세 가지 옵션이 검토되었다.

---

## Decision (결정)

**옵션 A — 현존 모듈 확장(Extend In Place)을 채택한다.**

- `BookingStatus`에 `NO_SHOW` 값을 추가(additive enum 확장, 기존 행 영향 없음)한다.
- `WaitlistStatus`에 `EXPIRED` 값을 추가하고, `Waitlist`에 `offeredSlotId`, `offerExpiresAt` 컬럼을 추가한다.
- Waitlist 오퍼는 **advisory(권고 전용)**이다. 슬롯 선점·calendar 배제가 아닌 알림 전송만 수행하며, 예약 선점의 유일한 결정자는 기존 `booking_slot_active_unique` 부분 unique 인덱스다.
- 스윕 로직(`sweepNoShows`, `sweepStalePending`, `sweepWaitlistOffers`)은 **도메인 서비스 메서드**에 두고, 얇은 타이머 전용 `OpsSchedulerService`(`@nestjs/schedule`)가 호출한다. 테스트는 메서드를 직접 호출한다(라이브 `@Interval` 비의존).
- DB 마이그레이션을 두 단계로 분리한다: **마이그레이션 1** — `ALTER TYPE ... ADD VALUE IF NOT EXISTS`(enum 전용, 같은 트랜잭션에서 신규 값 사용 불가라는 PostgreSQL 제약 준수); **마이그레이션 2** — 컬럼·FK·인덱스 추가.

---

## Alternatives Considered (검토된 대안)

| 옵션 | 장점 | 단점 | 비채택 이유 |
|------|------|------|------------|
| **A: 현존 모듈 확장 (채택)** | 최소 표면적; 검증된 패턴(스케줄러·RBAC·소유권·테스트 아일랜드) 재사용; 가장 빠른 green; 현 아키텍처와 정합 | Waitlist 오퍼가 advisory여서 대기자가 실제로 슬롯을 놓칠 수 있음; `waitlistConversionRate`는 "advisory 알림이 경쟁에서 이긴 비율"만 측정 | — (채택) |
| **B: `WaitlistOffer` 엔티티 / `AvailabilitySlot.heldUntil` 소프트 홀드** | 오퍼가 실질적 소프트 예약이 됨; `convertOnBooking`이 명확해짐; 감사 이력 풍부 | 가용성 모델에 잠금 가능한 상태 추가; 마이그레이션·쿼리 표면 확대; **advisor-by-construction** 접근보다 복잡 | MVP의 1차 가치는 *측정*이지 완전한 예약 선점이 아님. 단일 컬럼 추가(`heldUntil`)로 업그레이드 가능한 경로이므로 Phase-2 후속 과제로 명시하고 현 시점에는 기각 |
| **C: 이벤트 소싱 예약 생명주기** | 완벽한 감사 가능성; 리플레이로 깔때기 산출 명확 | 대규모 아키텍처 전환; 기존 예약 읽기 경로 전면 재작성; 2주 예산 크게 초과 | Principle 1(검증된 패턴 재사용)·예산 동인(Driver 1) 위반. 기각 |

---

## Consequences (결과와 트레이드오프)

### 긍정적 영향

- **예약 생명주기 완성**: `PENDING → CONFIRMED → COMPLETED / NO_SHOW / CANCELLED` 경로가 닫힌다. `NO_SHOW`는 스케줄러 자동 전이(상태 가드 `updateMany`) + 상담사 수동 override(`PATCH /bookings/:id/attendance`) 두 경로를 가진다.
- **Waitlist 루프 측정 가능**: `CONVERTED`·`EXPIRED` 전이가 생기므로 `waitlistConversionRate = CONVERTED / (CONVERTED + EXPIRED)`가 정의된다. 아직 진행 중인 `NOTIFIED`·`WAITING` 항목은 분모에 포함하지 않아 비율이 현재 완료 케이스만 반영한다.
- **운영 깔때기 대시보드 완성**: `booked / confirmed / completed / noShow / cancelled` 카운트 + `noShowRate`, `slotUtilization`, `waitlistConversionRate` 세 비율이 기존 `scope=own|all / counselorId` 필터를 그대로 준수한다.
- **슬롯 CRUD 인터페이스**: 상담사는 본인 슬롯을, 관리자는 임의 슬롯을 생성·수정·삭제할 수 있다. 중첩 슬롯 409 가드·활성 예약 삭제 409 가드로 데이터 무결성을 보장한다.
- **DB 원자성 유지**: 모든 상태 전이(취소+대기자 승격, 예약 생성+waitlist 전환)는 동일 트랜잭션 내에서 원자적으로 실행된다. check-then-act 게이트는 전혀 없다.

### 트레이드오프 / 부정적 영향

- **Advisory 오퍼의 한계**: Waitlist 오퍼는 슬롯을 선점하지 않는다. 알림을 받은 대기자보다 일반 고객이 먼저 예약하면 대기자는 슬롯을 놓친다. `waitlistConversionRate`는 "advisory 알림이 경쟁에서 이긴 비율"만 측정한다. 이 한계는 **의도적으로** 명시된 설계 경계다.
- **`NO_SHOW` 자동 전이 오분류 위험**: 상담이 실제로 이루어졌으나 상담사가 기록을 남기지 않은 경우 스케줄러가 자동으로 `NO_SHOW`로 전이한다. 이를 방지하기 위해 counselor override(`PATCH /bookings/:id/attendance`) 경로를 제공하며, "COMPLETED에는 기록이 있어야 한다"는 CRM 규율을 운영 지침으로 명시한다.
- **enum 비가역성**: `ADD VALUE IF NOT EXISTS`는 롤백이 불가능하다(백업에서 복원해야 함). 기존 마이그레이션들과 동일한 전향적(forward-only) 원칙을 적용한다.
- **Waitlist의 `counselorId` 직접 저장**: 현재 `Waitlist`는 counselorId를 직접 저장한다. 슬롯 단위(slot-level) 대기가 아닌 상담사 단위(counselor-level) 대기이므로, 이 설계는 의도적이다. 특정 슬롯 대기가 필요하면 Phase-2에서 `offeredSlotId` FK를 활용한 슬롯 수준 대기로 확장한다.

---

## Follow-ups (후속 과제 — Phase 2, 현 경계 유지)

- **실 소프트 홀드**: `AvailabilitySlot.heldUntil` / `heldForWaitlistId` 컬럼 추가 + 대기자가 오퍼를 받은 동안 해당 슬롯을 calendar에서 비노출. 단일 컬럼 추가로 구현 가능하며, 옵션 A를 재작성하지 않는다.
- **reschedule 플로우**: `CONFIRMED → RESCHEDULED → RE-CONFIRMED` 상태 전이 + 기존 슬롯 반환 + 새 슬롯 동시성 재보장 + waitlist 재트리거. 복합 플로우이므로 `docs/04-system-design.md`에 상태 전이도를 설계 경계로 명시하고 구현은 Phase 2.
- **Waitlist 자동 매칭 / 상담사 추천**: 상담사·시간 최적 추천, 선호도 기반 매칭. 별도 추천 알고리즘 서브시스템 필요.
- **실 알림 어댑터**: `NotificationChannel` 인터페이스 기반 SMS·이메일 어댑터 구현 (현재 Console/InApp 실동작, Email/SMS stub). 외부 계정 없음 동인이 해소되는 시점에 교체.
- **Analytics 사전집계(pre-aggregation)**: 데이터 규모 증가 시 실시간 집계 쿼리를 집계 테이블 + 증분 갱신 패턴으로 전환.
