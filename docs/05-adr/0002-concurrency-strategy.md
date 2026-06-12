# ADR 0002: 동시 예약 방지 전략 — DB unique constraint 채택

- **상태**: 확정 (Accepted)
- **날짜**: 2026-06-09
- **결정자**: 설계자 (솔로 과제)

---

## Context (결정 배경)

동일 슬롯에 두 명 이상의 고객이 동시에 예약을 시도할 때, 단 한 건만 확정(CONFIRMED)되어야 한다.
이를 잘못 설계하면 중복 예약이 DB에 저장되며, 이는 데이터 무결성 파괴이자 서비스 신뢰성 붕괴다.

추가로 다음 두 가지 설계 함정을 회피해야 한다.

1. **TOCTOU(Time-of-Check-Time-of-Use) 경쟁**: "가용 슬롯 조회 → 확인 후 삽입"(check-then-insert) 패턴은
   조회와 삽입 사이에 다른 트랜잭션이 끼어들 수 있다. 두 트랜잭션이 동시에 "가용"을 확인하고 모두 삽입에 성공하는 것이 가능하다.
2. **이중 진실원(dual source of truth)**: `AvailabilitySlot.isOpen` 불리언과 부분 unique 인덱스가
   "슬롯이 예약됨"을 이중으로 표현하면, 두 상태가 어긋날 경우 버그의 근원이 된다.

---

## Decision (결정)

**`Booking.slotId`에 부분 unique 인덱스(`WHERE status IN ('PENDING','CONFIRMED')`)를 걸고, insert-first/catch-violation 패턴을 사용한다.**

> **변경 이력 (booking_pending_first 마이그레이션)**: 초기 설계는 `WHERE status = 'CONFIRMED'`만 인덱스 조건으로 사용했다. 예약 생명주기가 PENDING-first 모델로 변경되면서, PENDING 상태에서도 슬롯을 선점해야 한다는 요구가 생겼다. 인덱스 조건을 `WHERE status IN ('PENDING','CONFIRMED')`으로 확장해, 두 고객이 동시에 PENDING 예약을 생성하는 경쟁도 DB 레벨에서 차단한다.

### 예약 생명주기: PENDING-first

예약은 생성 즉시 `PENDING` 상태로 저장된다. 담당 상담사가 `PATCH /bookings/:id/confirm`을 호출하면 `CONFIRMED`로 전이된다. 이 모델이 도입된 이유:

1. **실제 운영 반영**: 상담사가 일정을 검토하고 수락하는 절차가 존재한다.
2. **PENDING 선점으로 동시성 일관성 유지**: PENDING 상태도 슬롯을 선점하므로, 확정 전에도 다른 고객이 같은 슬롯을 예약할 수 없다.

### 구현 패턴: insert-first, catch 23505 → 409

```
트랜잭션 시작
  testResultId로 subject(subjectType/subjectId) 파생 + 소유권 검증
  INSERT INTO booking (slotId, customerId, subjectType, subjectId, testResultId, status='PENDING') 직접 시도
  → 성공: 201 Created { status: PENDING } 반환
  → Postgres unique violation (SQLSTATE 23505 / Prisma P2002): ConflictException(409) 매핑
트랜잭션 종료
```

check-then-insert 대신 insert-first를 쓰는 이유: 원자성을 DB가 보장하며, 애플리케이션 레이어에서
race condition을 다루지 않아도 된다.

### 단일 진실원(single source of truth) 설계

가용성은 **파생값**으로 정의한다.

```
슬롯이 가용하다 ≡ (AvailabilitySlot.isOpen = true)
               AND (startAt > now())
               AND (해당 slotId로 status IN ('PENDING','CONFIRMED')인 Booking이 없다)
               AND (startAt.hour ∈ [9, 18))
```

`isOpen`은 상담사가 슬롯을 운영상 열고/닫는 플래그로만 사용한다. 예약 상태(예약됨/빔)는 `isOpen`이
표현하지 않는다. CANCELLED/COMPLETED 예약은 인덱스 조건에서 제외되어 슬롯 재예약이 허용된다.

---

## Alternatives Considered (검토된 대안)

| 옵션 | 장점 | 단점 | 비채택 이유 |
|------|------|------|------------|
| **DB unique constraint + insert-first (채택)** | 가장 단순·확실; DB가 원자성 보장; 동시성 통합 테스트(20 concurrent)로 즉시 증명 가능; 코드 복잡도 최소 | 충돌 시 예외→409 매핑 필요; 슬롯 모델이 단순할 때만 깔끔 | — (채택) |
| **비관적 락 (`SELECT ... FOR UPDATE`)** | 충돌 전 차단, 결과 예측 명확 | 락 경합·타임아웃 관리 필요; 트랜잭션 길어짐; 데드락 리스크; 단건 슬롯 예약에서 추가 복잡도 대비 이득 없음 | 2주 솔로 과제에서 락 관리 오버헤드 과함. 슬롯 분할 예약·고객 대기열(Phase 2 Non-Goal)로 확장 시 재검토 항목으로 설계 문서에 기록 |
| **낙관적 버전 (version 컬럼 + 재시도)** | 락 free, 높은 동시성 처리율 | 재시도 로직·충돌 핸들링 코드 증가; 단건 슬롯 예약에서 ROI 낮음 | 단건 예약 충돌 빈도가 낮아 재시도 인프라 투자 대비 이득 없음. 슬롯 단위가 세분화되거나 경합이 높은 구조로 바뀔 때 재검토 |

---

## Consequences (결과와 트레이드오프)

**긍정적 영향**

- DB 레벨 원자성으로 TOCTOU 경쟁 구조적 제거.
- `booking.concurrency.spec.ts`(20 concurrent POST → 1 성공·19×409, DB count=1)로 정확성을 테스트로 증명 가능.
- `isOpen` 이중 진실원 제거로 슬롯 상태 버그 원천 차단.
- 취소(CANCELLED)/완료(COMPLETED) 슬롯은 부분 인덱스 조건(`WHERE status IN ('PENDING','CONFIRMED')`)에서 제외되므로, 취소 후 재예약이 자연스럽게 허용된다.

**트레이드오프 / 부정적 영향**

- `23505` 에러 코드를 `ConflictException(409)`으로 매핑하는 코드가 서비스 레이어에 필요하다. Prisma의 `PrismaClientKnownRequestError.code === 'P2002'`를 잡아 409로 변환하는 방식으로 구현한다.
- 슬롯을 시간 단위로 분할하거나 복수 상담사를 하나의 슬롯에 배정하는 구조로 확장될 경우, unique constraint 조건이 복잡해져 비관적 락 재검토가 필요하다.

---

## Follow-ups (후속 과제)

- 슬롯 분할 예약(예: 30분 슬롯을 15분 단위로 세분화) 도입 시 비관적 락(`SELECT ... FOR UPDATE`) 전환 여부 재검토.
- 고객 대기열(R8, Phase 2 Non-Goal) 도입 시 공석 탐지 + Booking INSERT 원자 묶음 트랜잭션 설계 필요.
- Prisma `P2002` 매핑을 공통 Exception Filter로 추출해 일관된 409 응답 포맷 보장.
