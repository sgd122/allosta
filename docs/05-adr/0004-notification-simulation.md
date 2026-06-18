# ADR 0004: 알림 시뮬레이션 — NotificationChannel 인터페이스 + Console 실동작 채택

- **상태**: 확정 (Accepted)
- **날짜**: 2026-06-09
- **결정자**: 설계자 (솔로 과제)

**결정 (한 줄):** 외부 계정 없이 재현 가능하도록 `NotificationChannel` 인터페이스를 정의하고 `ConsoleChannel`로 실동작하되, `EmailChannel`·`SmsChannel`은 어댑터 stub으로 제공한다.

---

## Context (결정 배경)

본 플랫폼은 두 가지 알림 이벤트를 처리해야 한다.

1. **CONFIRMATION**: 예약 생성 직후 즉시 발송
2. **REMINDER**: 예약 시각 전 일정 리드타임에 스케줄 잡으로 발송

> `Notification.type` enum에는 `SLOT_OPENED` 값이 **예약(reserved)**되어 있으나 현재 미사용이다 — 고객 대기열(공석 통지)이 Phase 2 Non-Goal로 미뤄졌기 때문이다. 대기열 도입 시 이 값을 활성화한다(03-mvp-scope §2.8).

알림 채널 후보는 콘솔 로그, 인앱(DB 레코드), 이메일, SMS/카카오 등이다.

핵심 제약: **재현성(외부 계정 0개).** 실제 SMS/카카오 발송은 외부 계정·API 키·수신 전화번호를 요구하며, 평가자가 동일한 환경에서 그대로 실행하는 것이 불가능해진다. 이 제약이 알림 설계의 모든 선택을 지배한다.

동시에, 알림 컴포넌트가 단순히 "미구현"처럼 보여서는 안 된다. 스케줄러가 실제로 발화하고, 상태 전이(PENDING→SENT)가 DB에 기록되며, 확장 채널 교체가 설계 수준에서 가능함을 코드로 드러내야 한다.

---

## Decision (결정)

**`NotificationChannel` 인터페이스를 정의하고, `ConsoleChannel`로 실동작하며, `EmailChannel`·`SmsChannel`은 어댑터 stub으로 제공한다. 스케줄러는 `@nestjs/schedule` cron 잡으로 실제 발화한다.**

### 컴포넌트 구조

```
backend/src/notification/
├── notification.module.ts
├── notification.service.ts          ← Notification DB 레코드 생성·상태 전이
├── notification.scheduler.ts        ← @Cron(): PENDING REMINDER 스캔 → 발송
└── channels/
    ├── notification-channel.interface.ts   ← send(notification): Promise<void>
    ├── console.channel.ts                  ← 실동작: console.log + status → SENT
    ├── email.channel.ts                    ← stub: 설계 주석 + NotImplementedException
    └── sms.channel.ts                      ← stub: 설계 주석 + NotImplementedException
```

### NotificationChannel 인터페이스

```typescript
export interface NotificationChannel {
  readonly channelType: ChannelType; // CONSOLE | IN_APP | EMAIL | SMS
  send(notification: Notification): Promise<void>;
}
```

`NotificationService`는 `NotificationChannel[]`을 주입받아 `channelType`으로 라우팅한다.
실 채널 교체는 `ConsoleChannel`을 `EmailChannel` 구현체로 교체하는 것만으로 완성된다.

### 스케줄러 결정성(demo determinism) 확보

"예약 시각 전 리마인더"는 seed 슬롯이 먼 미래라면 평가 창 안에서 발화하지 않을 수 있다. 이를 세 가지로 해결한다.

1. `REMINDER_LEAD_MINUTES` 환경 변수로 리드타임 조정 가능(기본값 30분, 데모 시 1–2분으로 설정).
2. `seed.ts`에 현재 시각 기준 가까운 미래(+10분) 슬롯 1건 포함 — 스케줄러가 데모 중 실제 발화.
3. `backend/scripts/trigger-scheduler.ts`(앱 컨텍스트 부팅 → `NotificationService.dispatchPending()` 호출 후 종료) 또는 ADMIN 전용 엔드포인트 `POST /admin/notifications/dispatch`로 수동 즉시 트리거 제공.

---

## Alternatives Considered (검토된 대안)

| 옵션 | 장점 | 단점 | 비채택 이유 |
|------|------|------|------------|
| **NotificationChannel 인터페이스 + ConsoleChannel 실동작 + stub (채택)** | 외부 계정 0개(재현성 완전 충족); 스케줄러 실발화·상태 전이 증명; 채널 교체 확장성 설계 가시화 | 실제 알림이 수신자에게 전달되지 않음; 평가자가 콘솔/DB 확인 필요 | — (채택) |
| **실제 이메일 발송 (SendGrid, SES 등)** | 실제 알림 경험 | 외부 계정·API 키·이메일 주소 필요 → 재현성 동인 직접 위반; 네트워크 의존으로 평가 환경 불안정 | 재현성 동인 위반으로 즉각 비채택 |
| **실제 SMS/카카오 발송** | 실제 알림 경험 | 외부 계정·전화번호 필요; 국내 서비스 계약 필요; 재현성 동인 위반 | 동일하게 재현성 동인 위반으로 비채택 |
| **알림 컴포넌트 전체 생략** | 구현 시간 절약 | "알림 설계 없음"으로 평가됨; CONFIRMATION·REMINDER 이벤트가 AC5에서 미증명 | 설계 역량 입증 동인에 반함. 인터페이스 설계 비용은 stub 파일 2개이며, 얻는 신호는 크다. |

---

## Consequences (결과와 트레이드오프)

**긍정적 영향**

- 외부 계정 없이 `docker compose up` + seed 만으로 알림 흐름 전체 동작 및 검증 가능.
- `NotificationChannel` 인터페이스가 실 채널 추가의 명확한 확장 경로를 제공한다. 실 SMS 어댑터 구현 시 `SmsChannel.send()` 구현만 추가하면 되고, `NotificationService`·`NotificationScheduler`는 변경이 불필요하다.
- Notification DB 레코드 + `status(PENDING→SENT)` 전이가 기록되어 알림 이력 추적이 가능하다.
- 스케줄러(`notification.scheduler.ts`)가 실제 cron 잡으로 동작하므로 "스케줄러가 존재한다"는 증명이 콘솔 출력으로 가시화된다.

**트레이드오프 / 부정적 영향**

- 실 사용자는 알림을 받지 못한다. 데모 목적으로는 콘솔/DB 확인으로 대체한다.
- `EmailChannel`·`SmsChannel`이 stub이므로, 코드 리뷰 시 "구현되지 않았다"는 오해를 방지하기 위해 파일 내 주석에 "의도적 stub — Phase 2 실 구현 경로"를 명시한다.

---

## Follow-ups (후속 과제)

- Phase 2: `EmailChannel` 실 구현 (AWS SES 또는 SendGrid 어댑터, `SMTP_*` 환경 변수 주입).
- Phase 2: `SmsChannel` / `KakaoChannel` 실 구현 (국내 알림톡 어댑터).
- 알림 실패(`FAILED` 상태) 시 재시도 로직 — 현재는 catch + status=FAILED 기록으로 종료. 재시도 큐(BullMQ)는 Phase 2.
- `REMINDER_LEAD_MINUTES` 환경 변수 기본값과 데모 권장값을 `README.md` 시연 절차에 명시.
