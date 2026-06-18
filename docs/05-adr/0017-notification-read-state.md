# ADR 0017: 알림 읽음 상태(Notification Read State)

- **상태**: 확정 (Accepted)
- **날짜**: 2026-06-17
- **결정자**: 설계자 (솔로 과제)

**결정 (한 줄):** `Notification`에 nullable `readAt DateTime?` 컬럼을 additive로 추가해, 발송 상태(PENDING→SENT)와 독립된 별도 축으로 읽음 여부를 추적한다.

---

## Context (결정 배경)

알림(`Notification`)은 예약 시 CONFIRMATION/REMINDER가 생성되어 고객에게 인앱(벨 위젯)으로 노출된다(ADR 0004). 그러나 "읽음" 개념이 없어, 고객은 한 번 본 알림과 새 알림을 구분할 수 없고 벨의 미확인 배지가 누적되기만 한다 — 운영 알림으로서의 신호 가치가 떨어진다.

**제약 조건**

- **P5 루즈 커플링**: 읽음 처리는 알림의 표시 상태만 바꿀 뿐, 예약 출석/발송 상태(`Booking.status`, `Notification.status`)를 건드리면 안 된다. 발송 라이프사이클(PENDING→SENT)과 사용자 열람은 직교한다.
- **소유권**: 알림은 그 예약(`booking.customerId`)을 소유한 고객만 읽음 처리할 수 있어야 한다(2-레이어 권한, ADR 0010 / FR7과 일관).

## Decision (결정)

`Notification`에 **nullable `readAt DateTime?`** 컬럼을 additive로 추가한다(기존 컬럼 ALTER 없음,
마이그레이션 `20260617000000_notification_read`). 발송 상태 enum과 분리된 별도 축으로 둔다.

- `PATCH /notifications/:id/read` (Role.CUSTOMER): 알림의 소유 고객을 `booking.customerId`로
  파생해 검증 — 없으면 404, 타 고객이면 403, 아니면 `readAt = now()`로 설정한다. 멱등(재호출 무해).
- `GET /notifications`는 `readAt`을 포함한다.
- 프론트 벨 위젯: 미확인 배지는 `readAt == null`만 집계하고, 행 열람 시 읽음 처리하며 읽은 알림은
  시각적으로 약화한다.

## Consequences (결과)

- 읽음/미확인이 발송 상태와 독립적으로 추적되어 벨 신호가 의미를 갖는다.
- 읽음은 표시 전용 — 출석/발송 단일 진실 원천(`Booking`/`Notification.status`)은 불변.
- 검증: `backend/test/notification-read.spec.ts`(소유 200·멱등, 타 고객 403). 읽음 상태는
  표시 계층이라 골든패스 도메인 로직에 영향을 주지 않는다.

## Alternatives (대안)

- **`status`에 READ 추가**: 발송 라이프사이클(PENDING/SENT/FAILED)과 사용자 열람을 한 enum에
  섞으면 "발송됐고 읽음" 같은 조합을 표현하지 못한다 — 직교 축이므로 별도 컬럼으로 분리.
- **dismiss(영구 삭제)**: MVP에서는 읽음만으로 신호 정리에 충분. 영구 삭제/보관은 Phase 2.
