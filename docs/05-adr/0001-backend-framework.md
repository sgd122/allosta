# ADR 0001: 백엔드 프레임워크 — NestJS 채택

- **상태**: 확정 (Accepted)
- **날짜**: 2026-06-09
- **결정자**: 설계자 (솔로 과제)

---

## Context (결정 배경)

2주 솔로 평가과제에서 백엔드 프레임워크를 선택해야 한다. 과제 명세는 NestJS 또는 FastAPI를 허용한다.
본 과제의 핵심 데모 포인트는 다음 세 가지다.

1. **3-role RBAC** — 고객/상담사/관리자 역할을 선언적으로 적용하고, 평가자가 "의도가 코드로 드러나는가"를 볼 수 있어야 한다.
2. **알림·운영 스케줄러** — 예약 리마인더 발송과 no-show·stale-pending 스윕을 주기적으로 발화하는 스케줄 잡이 내장되어야 한다.
3. **단일 언어 모노레포** — 프론트엔드(React/TypeScript)와 백엔드가 같은 언어를 공유하면 DTO/타입 중복 유지비가 없다.

의사결정 동인 순위: 재현성(외부계정 0개) → 2주 솔로 예산 → 설계역량 입증.

---

## Decision (결정)

**NestJS(TypeScript)를 백엔드 프레임워크로 채택한다.**

구체적 선택:

- 인증/RBAC: `@nestjs/jwt` + `PassportStrategy` + `RolesGuard` (Guard 기반 선언적 접근제어)
- ORM: Prisma (스키마 first, 마이그레이션 자동화, TypeScript 타입 자동 생성)
- 스케줄러: `@nestjs/schedule` (데코레이터 기반 cron 잡, 외부 의존 없음)
- API 문서: `@nestjs/swagger` (OpenAPI 자동 생성)

---

## Alternatives Considered (검토된 대안)

| 옵션 | 장점 | 단점 | 비채택 이유 |
|------|------|------|------------|
| **NestJS (채택)** | FE와 TypeScript 단일 언어 → DTO/타입 중복 없음; `@nestjs/schedule`로 스케줄러 내장; Guard 기반 RBAC가 선언적이라 설계 의도가 코드로 드러남; Prisma 통합 성숙 | 보일러플레이트 다소 많음; 콜드스타트가 FastAPI보다 무거움(평가 환경에서 무관) | — (채택) |
| **FastAPI (Python)** | 빠른 작성, Pydantic 검증 우수, 자동 OpenAPI 생성 | FE(TypeScript)와 언어 이원화 → DTO/타입 정의를 BE(Python)·FE(TS) 양쪽에서 유지해야 함; 스케줄러(`APScheduler`)·RBAC(`fastapi-users` 등)는 외부 패키지 조합 필요; 솔로 2주에서 두 언어의 인지 부하 증가 | FE 언어 이원화로 인한 DTO 중복 유지비가 솔로 일정에서 불리하고, RBAC·스케줄러를 선언적으로 표현하는 내장 수단이 없어 설계 의도 가독성이 낮음 |

---

## Consequences (결과와 트레이드오프)

**긍정적 영향**

- `@RolesGuard()` + `@Roles(Role.ADMIN)` 데코레이터로 역할 접근제어 의도가 코드 수준에서 즉시 가독되며, 평가자가 Guard 레이어와 서비스 레이어의 분리를 명확히 확인할 수 있다.
- `@nestjs/schedule`의 `@Cron()` 데코레이터로 리마인더 스케줄러가 추가 인프라 없이 동작한다(재현성 동인 충족).
- FE/BE가 TypeScript 단일 언어이므로 DTO/타입을 양쪽 언어에서 이중 정의할 필요가 없다. 공유 타입 패키지(`packages/shared-types`)로 한 곳에서 관리하는 경로도 열려 있으나, 현재는 도입하지 않았다(YAGNI — ADR 0005 참조).

**트레이드오프 / 부정적 영향**

- NestJS 보일러플레이트(모듈/컨트롤러/서비스 3-파일 구조)가 FastAPI 대비 초기 파일 수를 늘린다. 솔로 과제에서 소음이 될 수 있으나, 모듈 경계가 오히려 도메인 분리를 가시화하는 신호가 된다.
- 콜드스타트가 FastAPI보다 느리지만, 평가 환경(로컬 docker compose)에서는 측정 의미가 없다.

---

## Follow-ups (후속 과제)

- 실 운영 전환 시 콜드스타트 최적화(lazy module loading) 검토.
- 스케줄러를 외부 큐(BullMQ, Redis) 기반으로 교체할 경우 `NotificationScheduler`를 독립 워커로 분리하는 경로 설계.
- FastAPI 대비 성능 비교가 요구될 경우 `/health` 엔드포인트 벤치마크 추가.
