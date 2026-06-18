# ADR 0016: CallLog 비파괴적 증거 레이어

- **상태**: 확정 (Accepted)
- **날짜**: 2026-06-13
- **결정자**: 설계자 (솔로 과제)

**결정 (한 줄):** `CallLog` 테이블을 순수 additive로 추가해 상담사의 통화 시도 결과를 기록하되, `Booking.status`는 절대 건드리지 않는다(P5 루즈 커플링).

---

## Context (결정 배경)

no-show(당일 연락 두절)는 상담사가 직접 전화를 시도하지만 결과가 어디에도 기록되지 않는다. 고객이 무응답인지, 번호가 잘못되었는지, 연결됐으나 재예약 의사가 없는지를 집계할 방법이 없다.

R6 대응으로 리마인더 알림(시뮬레이션)을 MVP에 포함하지만, 리마인더 발송 후에도 실제 연락 시도 결과를 추적하는 레이어가 없으면 "리마인더가 의미 있었는가"를 측정할 수 없다.

또한 상담사는 예약 브리핑 시 고객에게 직접 전화를 걸어야 하는데, 현재 브리핑 API(`GET /counselor/bookings/:bookingId/brief`)에는 고객 전화번호(`phone`)가 포함되지 않는다.

**제약 조건**

- **NFR1**: 외부 계정 수 = 0 — 발표 환경에서 외부 종속성 없이 재현 가능해야 함
- **P5 루즈 커플링**: 통화 시도 기록이 예약 출석 상태(`Booking.status`)를 직접 변경해서는 안 됨. 출석 여부의 단일 진실 원천은 `Booking`에 유지된다.

---

## Decision (결정)

**CallLog** 테이블을 순수 additive 방식으로 추가한다. 기존 테이블에 ALTER 없음.

### 스키마

```
model CallLog {
  id          String      @id @default(cuid())
  bookingId   String
  counselorId String
  outcome     CallOutcome
  note        String?
  createdAt   DateTime    @default(now())
  booking     Booking     @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  counselor   Counselor   @relation(fields: [counselorId], references: [id], onDelete: Cascade)

  @@index([bookingId])
  @@index([counselorId])
}

enum CallOutcome {
  CONNECTED
  NO_ANSWER
  INVALID
}
```

### API 경계

- `POST /counselor/bookings/:bookingId/calls` (COUNSELOR 역할만)
  - Body: `{ outcome: CallOutcome, note?: string }`
  - 소유권 검증 포함 (`assertBookingOwnedByCounselor`)
- `PATCH /counselor/bookings/:bookingId/calls/:callId` (COUNSELOR 역할만)
  - Body: `{ outcome: CallOutcome, note?: string }`
  - 잘못 클릭한 outcome 정정·메모 수정용.
  - 동일한 `assertBookingOwnedByCounselor` 소유권 경계 재사용(새 RBAC 없음).
  - 해당 CallLog가 그 bookingId에 속하는지 확인한다(아니면 `404` — 교차 예약 편집 차단).
  - `outcome` + `note`만 변경하며 `Booking.status`는 절대 건드리지 않는다(P5).
  - outcome을 수정하면 집계가 **읽기 시점에 재계산**되므로 별도 마이그레이션·백필이 필요 없다.
- `DELETE /counselor/bookings/:bookingId/calls/:callId` (COUNSELOR 역할만)
  - 잘못 생성된 항목 제거용.
  - 동일한 `assertBookingOwnedByCounselor` 소유권 경계 재사용(새 RBAC 없음).
  - 해당 CallLog가 그 bookingId에 속하는지 확인한다(아니면 `404`).
  - `Booking.status`는 절대 건드리지 않는다(P5).
  - 행 삭제 후 집계가 **읽기 시점에 재계산**되므로 별도 마이그레이션·백필이 필요 없다.

### brief 통화 이력 노출

`GET /counselor/bookings/:bookingId/brief` 응답에 `callLogs: { id, outcome, note, createdAt }[]`(최신순)를 추가한다. POST 생성 응답과 달리 **brief에는 `note`를 포함**한다. brief는 `phone`과 동일한 담당 상담사 소유권 경계 안에서만 노출되므로 메모를 담당자에게 되돌려 보여 주는 것은 일관된 containment이며, 상담사가 기록을 검토·정정할 수 있게 한다. POST 생성 응답은 여전히 `note`를 echo하지 않고, 어떤 admin 집계에도 `note`는 노출되지 않는다(집계는 `outcome`만 읽음).

### phone 노출 경계

`GET /counselor/bookings/:bookingId/brief` 응답에 `phone: string` 필드를 추가한다. `brief` API는 이미 COUNSELOR 소유권 검증을 수행하므로 PII 접근이 가장 좁은 범위로 제한된다. `Customer.phone`은 기존 필드이며 스키마 변경 없음 — 브리핑 투영만 추가한다.

### 집계 지표 (Analytics 확장)

| 필드 | 타입 | 설명 |
|------|------|------|
| `contactAttempts` | `number` | 해당 상담사의 CallLog 총 건수 |
| `callOutcomeDistribution` | `{ CONNECTED, NO_ANSWER, INVALID }` | outcome별 카운트 |
| `noShowWithoutContactRate` | `number \| null` | NO_SHOW 예약 중 CallLog 없는 비율. NO_SHOW가 0개면 `null` |

`noShowWithoutContactRate`는 상담사 자기보고(self-reported) 지표다.
CallLog를 입력하지 않으면 연락을 시도했어도 미접촉으로 집계된다.

---

## Alternatives Considered (검토된 대안)

| 대안 | 설명 | 기각 이유 |
|------|------|-----------|
| `tel:` 링크만 노출 | 전화번호를 클릭 가능 링크로만 표시, 기록 없음 | 통화 결과 집계 불가. 리마인더 효과 측정 불가 |
| 번호 마스킹 / VoIP 연동 | 서드파티 통화 서비스로 통화 기록 자동 수집 | NFR1 위반 (외부 계정 필요). 솔로 과제 범위 초과 |
| `Booking.status`에 `CALLED` 추가 | 통화 시도를 예약 상태로 표현 | 출석 여부와 통화 시도를 혼합 — 단일 책임 위반. 복수 통화 시도 기록 불가 |

---

## Consequences

**긍정적**

- 기존 테이블 무변경(additive) — 기존 테스트 green 유지
- COUNSELOR 소유권 검증 범위 내에서 `phone` 접근이 최소화됨
- `noShowWithoutContactRate`로 리마인더 대비 연락 시도 효과를 정량 측정 가능
- `CallOutcome` enum으로 통화 결과를 구조화하여 분석 가능

**부정적 · 주의**

- `noShowWithoutContactRate`는 자기보고 지표 — 입력 누락 시 실제보다 높게 집계될 수 있음
- `phone` 브리핑 투영은 현재 감사 로그 없음 — 접근 기록이 필요하면 Phase 2 deferral
- 복수 CallLog가 허용됨 (동일 예약에 여러 통화 시도 가능) — 의도된 설계
- CallLog는 생성 후 `PATCH`로 편집 가능(outcome 정정·메모 수정). 집계가 read-time이므로
  outcome 편집은 즉시 Analytics에 반영되며 마이그레이션·백필이 없다. 편집 역시
  `Booking.status`를 건드리지 않는다(P5 불변). 편집 이력(audit trail)은 보관하지 않음 —
  필요 시 Phase 2 deferral.

---

## Follow-ups

- **Phase 2**: `briefOpenedAt` 수준의 phone 접근 감사 로그 (`PhoneAccessLog` 엔티티)
- **Phase 2**: CallLog 기반 no-show 패턴 분석 대시보드 (상담사별 연락 시도 추이)
- **Phase 2**: no-show 발생 시 상담사에게 CallLog 입력 유도 알림 (in-app 리마인더)
