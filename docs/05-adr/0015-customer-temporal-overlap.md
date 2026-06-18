# ADR 0015: 고객 시간대 중복 예약 방지 — GiST EXCLUDE 제약 채택

- **상태**: 확정 (Accepted)
- **날짜**: 2026-06-12
- **결정자**: 설계자 (솔로 과제)

**결정 (한 줄):** `Booking`에 Postgres GiST `EXCLUDE` 제약 `booking_customer_no_overlap`을 추가해, 한 고객의 ACTIVE 예약끼리 시간 범위가 겹치지 못하도록 DB 레벨에서 강제한다.

---

## Context (결정 배경)

기존 부분 unique 인덱스 `booking_slot_active_unique`는 **동일 `slotId`**에 ACTIVE 예약이 둘 이상 생기는 것만 막는다(ADR 0002). 그러나 이 인덱스는 **한 고객이 서로 다른 슬롯(예: 서로 다른 상담사)**의 같은/겹치는 시간대에 복수의 ACTIVE 예약을 보유하는 것을 막지 못한다.

실제 DB에서 확인된 버그: `customer@demo.com`이 2026-06-16 10:00 KST에 서로 다른 상담사 슬롯 두 건을 모두 PENDING으로 보유하고 있었다. 한 사람은 동시에 두 상담을 받을 수 없으므로 이는 데이터 무결성 위반이다.

슬롯 길이는 30분·60분 등으로 가변적이므로, 이 불변식은 **시작 시각 동일**이 아니라 **시간 범위(range) 겹침**으로 강제해야 한다.

---

## Decision (결정)

**`Booking`에 Postgres GiST `EXCLUDE` 제약 `booking_customer_no_overlap`을 추가해, 한 고객의 ACTIVE 예약끼리 시간 범위가 겹치지 못하도록 DB 레벨에서 강제한다.**

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Booking" ADD CONSTRAINT "booking_customer_no_overlap"
  EXCLUDE USING gist (
    "customerId" WITH =,
    tsrange("slotStartAt", "slotEndAt") WITH &&
  )
  WHERE ("status" IN ('PENDING', 'CONFIRMED'));
```

### 핵심 설계 결정

1. **비정규화된 슬롯 윈도우(`Booking.slotStartAt` / `slotEndAt`)**: 시간 정보는 `AvailabilitySlot`에 있으나, EXCLUDE 제약은 단일 `Booking` 행에 대해 범위를 만들 수 있어야 한다. 따라서 예약된 슬롯의 `[startAt, endAt)` 윈도우를 `Booking`에 비정규화해 복제한다. 이 컬럼은 `create()` 시점에 **write-once**로 설정된다(예약은 슬롯을 재조정(reschedule)하지 않기 때문).
2. **`btree_gist` 확장**: 스칼라 동치(`customerId WITH =`)와 범위 겹침(`tsrange WITH &&`)을 하나의 GiST EXCLUDE 제약에 함께 넣으려면 `btree_gist`가 필요하다.
3. **ACTIVE 상태에 대한 부분 제약**: `WHERE status IN ('PENDING','CONFIRMED')` — `booking_slot_active_unique`와 정확히 동일한 부분 조건. CANCELLED/COMPLETED/NO_SHOW 예약은 제약에서 제외되므로, 취소 후 동일 시간대 재예약이 자연스럽게 허용된다.
4. **`tsrange` (not `tstzrange`)**: `AvailabilitySlot.startAt/endAt`가 `TIMESTAMP(3)`(timezone 없는 timestamp)이므로, 컬럼 타입과 정확히 일치시키기 위해 `tsrange`를 사용한다. `tstzrange`를 쓰면 세션 타임존에 의존하는 암묵적 캐스트가 발생해 취약하다.
5. **반열린 구간 `[)`**: 인접 예약(10:00–11:00, 11:00–12:00)은 겹치지 않는다.

### 방어선 (defense in depth)

- **DB 제약**: 동시성 하에서의 **진짜 보장**. 두 동시 요청의 앱 레벨 사전 검사가 모두 통과하더라도, 제약이 정확히 1건만 커밋되도록 보장한다.
- **앱 레벨 사전 검사 (UX 전용)**: `create()`에서 트랜잭션 전에 고객의 ACTIVE 예약 중 `[slotStartAt, slotEndAt)`가 요청 윈도우와 겹치는 것이 있으면 `409 ConflictException('이미 같은 시간대에 예약이 있습니다.')`를 던진다. 겹침 판정: `existing.slotStartAt < newEnd AND existing.slotEndAt > newStart`.
- **23P01 매핑**: 제약 위반은 Postgres `exclusion_violation`(SQLSTATE `23P01`)로 발생한다. Prisma는 이를 전용 `code` 없는 `PrismaClientUnknownRequestError`로 surface하며, `message`에 `23P01`과 제약명 `booking_customer_no_overlap`이 포함된다(경험적으로 검증). 서비스 catch 블록에서 이 두 토큰 중 하나로 매칭해 `409`로 매핑한다. 기존 P2002 → 'Slot is already booked' 매핑은 그대로 유지한다.

---

## Alternatives Considered (검토된 대안)

| 옵션 | 장점 | 단점 | 비채택 이유 |
|------|------|------|------------|
| **GiST EXCLUDE + 비정규화 윈도우 + btree_gist (채택)** | DB가 범위 겹침을 원자적으로 보장; 가변 슬롯 길이를 정확히 다룸; 동시성 통합 테스트로 증명 가능; `booking_slot_active_unique`와 동일한 부분 조건 패턴으로 일관성 유지 | 슬롯 윈도우를 비정규화해야 하며 동기화 유지 필요; 23P01 매핑 코드 필요 | — (채택) |
| **앱 레벨 사전 검사만** | 추가 컬럼·확장 불필요; 단순 | 동시성 하에서 TOCTOU 경쟁에 그대로 노출 — 두 요청이 모두 "겹침 없음"을 확인하고 모두 삽입 가능; 코드베이스가 슬롯 배타성은 DB로 강제하는데 고객 배타성만 앱으로 두면 엄밀성 비대칭 | 동시성 정확성(NFR2) 미달 |
| **`(customerId, slotStartAt)` unique 인덱스** | 단순; 확장 불필요 | 시작 시각 동일만 막고 부분 겹침(가변 길이)을 못 막음 — 10:00–11:00과 10:30–11:30을 허용 | 요구사항(범위 겹침) 미충족 |

---

## Consequences (결과와 트레이드오프)

**긍정적 영향**

- DB 레벨 원자성으로 고객 자기 중복 예약을 구조적으로 제거(동시성 포함).
- `booking.self-overlap.spec.ts`로 정확성을 증명: 동일 시각·다른 상담사 → 409, 부분 겹침(가변 길이) → 409, 취소 후 재예약 → 성공, 인접(비겹침) → 둘 다 성공, 동시 요청 2건 → 정확히 1건 성공·1건 409.
- `booking_slot_active_unique`와 동일한 "부분(ACTIVE) 제약 + insert-first/catch-violation" 패턴을 재사용해 동시성 설계의 일관성을 유지.

**트레이드오프 / 부정적 영향**

- **비정규화 동기화 책임**: `Booking.slotStartAt/slotEndAt`는 `AvailabilitySlot`의 시간을 복제한 값이다. 현재 예약은 슬롯을 재조정하지 않으므로 이 윈도우는 `create()` 시점 write-once이며 표류하지 않는다. **단, 향후 예약 재조정(reschedule) 기능이 추가되면 슬롯 시간 변경 시 이 두 컬럼을 반드시 함께 갱신해야 한다.** 이 책임은 schema/seed/service 주석과 본 ADR에 명시되어 있다.
- 23P01을 `409`로 매핑하는 코드가 서비스 레이어에 필요하다. Prisma가 전용 code를 제공하지 않으므로 message 기반 매칭으로 구현한다.
- `btree_gist` 확장 의존성이 추가된다(마이그레이션에서 `CREATE EXTENSION IF NOT EXISTS`로 보장).

---

## Follow-ups (후속 과제)

- 예약 재조정(reschedule) 기능 도입 시 `slotStartAt/slotEndAt` 갱신 로직 추가 + 제약 회귀 테스트 보강.
- 23P01/P2002 매핑을 공통 Exception Filter로 추출해 일관된 409 응답 포맷 보장(ADR 0002 후속과 동일 라인).
