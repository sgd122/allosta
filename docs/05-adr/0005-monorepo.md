# ADR 0005: 레포 구조 — 단일 모노레포 채택

- **상태**: 확정 (Accepted)
- **날짜**: 2026-06-09
- **결정자**: 설계자 (솔로 과제)

**결정 (한 줄):** 평가자의 재현 마찰을 최소화하기 위해 FE/BE를 단일 모노레포로 관리하고, 빌드 오케스트레이션 도구는 YAGNI로 미도입한다.

---

## Context (결정 배경)

본 과제는 프론트엔드(React/TypeScript)와 백엔드(NestJS/TypeScript)를 모두 포함한다. 이 두 컴포넌트를 하나의 레포지토리에 둘 것인지, 분리된 레포지토리로 관리할 것인지 결정해야 한다.

핵심 제약: **재현성(외부 계정 0개, 단일 명령 기동).** 평가자가 레포를 받아 최소한의 명령으로 golden path를 끝까지 재현할 수 있어야 한다. 레포 구조가 이 마찰을 높이면 안 된다.

---

## Decision (결정)

**단일 모노레포(single monorepo)를 채택한다.**

디렉토리 구조:

```
allosta/                          ← 루트 (단일 git 레포)
├── backend/                      ← NestJS 애플리케이션
│   ├── src/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   └── package.json
├── frontend/                     ← React (Next.js App Router) 애플리케이션
│   ├── src/
│   └── package.json
├── docs/                         ← 설계 문서·ADR
│   ├── 01-problem-definition.md
│   ├── 02-requirements.md
│   ├── 03-mvp-scope.md
│   ├── 04-system-design.md
│   └── 05-adr/
├── docker-compose.yml            ← PostgreSQL 컨테이너 단일 정의
├── package.json                  ← pnpm workspace 루트 (선택)
└── README.md                     ← 단일 실행 가이드
```

빌드 오케스트레이션 도구(turborepo, nx 등)는 **채택하지 않는다** — YAGNI.
`pnpm workspace` 또는 단순 디렉토리 분리로 충분하다.

---

## Alternatives Considered (검토된 대안)

| 옵션 | 장점 | 단점 | 비채택 이유 |
|------|------|------|------------|
| **단일 모노레포 (채택)** | 평가자가 한 번 클론 → 한 번 기동; `docker-compose.yml` 단일 파일로 DB + 서비스 통합 관리; 공유 타입 패키지(`packages/shared-types`) 가능; README 단일화 → 재현성 마찰 최소 | 빌드 설정 약간 복잡; BE·FE 의존성이 한 레포에 혼재 | — (채택) |
| **FE/BE 분리 레포** | 관심사 분리 명확; 각 팀이 독립 배포 가능 | 평가자가 클론 2회·기동 2회 필요 → 재현성 마찰 증가; 타입 공유 불가(DTO 중복 유지비 발생); README를 두 곳에서 유지; 평가 오버헤드 | 재현성 동인이 분리 레포의 이점을 압도한다. 관심사 분리는 단일 레포 내 디렉토리 구조로도 충분히 표현된다. |
| **모노레포 + turborepo / nx** | 캐시 기반 빌드, 태스크 파이프라인 최적화 | 설정 복잡도 증가; 2주 솔로 과제에서 실질적 이득 없음 | **YAGNI.** turborepo는 다수 패키지·CI 파이프라인 최적화가 필요할 때 도입하는 도구다. 현재는 `backend/`·`frontend/` 두 앱이며, 빌드 캐시 이득이 없다. 불필요한 설정 복잡도를 도입하지 않는다. |

---

## Consequences (결과와 트레이드오프)

**긍정적 영향**

- 평가자의 재현 절차가 단일 흐름으로 수렴한다: `git clone` → `docker compose up` → `prisma migrate` + `seed` → `pnpm dev`.
- `docker-compose.yml` 하나에 PostgreSQL 컨테이너와 환경 변수가 정의되어 외부 인프라 의존이 없다.
- 공유 타입(`packages/shared-types`)을 두면 FE API 클라이언트와 BE DTO가 동기화된다(선택적 적용).
- 설계 문서(`docs/`)가 코드와 같은 레포에 있어 코드-문서 갭이 생기지 않는다.

**트레이드오프 / 부정적 영향**

- FE와 BE의 `node_modules`가 한 레포에 혼재한다. `pnpm workspace`로 호이스팅을 관리하거나, 단순히 각 디렉토리에서 독립 설치하는 방식으로 처리한다.
- 실 운영 전환 시 FE·BE를 독립 배포해야 한다면 레포 분리 또는 `git subtree` 분리가 필요할 수 있다. 그러나 단일 레포 구조가 이 전환을 막지는 않는다(디렉토리 경계가 명확히 분리되어 있으므로).

---

## Follow-ups (후속 과제)

- 실 운영 배포 시 FE(CDN/정적 호스팅)와 BE(컨테이너)를 독립 파이프라인으로 분리하는 CI/CD 설계.
- 공유 타입 패키지(`packages/shared-types`) 도입 여부 — 타입 중복이 실질적으로 문제가 될 때 도입(YAGNI 원칙 유지).
- 패키지 수가 3개 이상으로 늘거나 CI 빌드 시간이 문제가 될 때 turborepo 도입 재검토.
