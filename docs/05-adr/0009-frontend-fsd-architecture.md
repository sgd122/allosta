# ADR 0009 — 프론트엔드 Feature-Sliced Design(FSD) 아키텍처 도입

- **상태**: Accepted (세그먼트 컨벤션은 [0012](./0012-frontend-types-constants-segments.md)에서 정련: `model`→`types`, `constants` 신설)
- **날짜**: 2026-06-10
- **관련**: [04-system-design §9 프론트엔드 아키텍처](../04-system-design.md#9-프론트엔드-아키텍처), [0005 monorepo](./0005-monorepo.md), [0008 test-report-grouping](./0008-test-report-grouping.md), [0012 types/constants 세그먼트](./0012-frontend-types-constants-segments.md)

**결정 (한 줄):** 타입별 단일 거대 파일 구조를 해체하고 FSD 레이어(`app → views → widgets → features → entities → shared`)로 재편한다. Next.js App Router와의 충돌은 `src/` 하위 레이어 + 얇은 라우팅 분리로 해결한다.

## 맥락

초기 프론트엔드는 **타입별(by-type) 폴더 구조**였다: `app/`(Next 라우팅) · `components/`(공유 UI) · `lib/`(`api-client.ts` ~35개 함수, `types.ts` 전 도메인 296줄, `format`/`auth`/`metrics`/`reports`). 도메인이 한곳에 섞여 다음 문제가 있었다.

1. **단일 거대 모듈**: `lib/api-client.ts`·`lib/types.ts`가 booking·analytics·family-link 등 모든 도메인을 한 파일에 담아 응집도가 낮고 변경 영향 범위가 넓다.
2. **경계 부재**: 어떤 코드가 어떤 도메인에 속하는지, 무엇이 무엇을 import해도 되는지에 대한 규칙이 없다.
3. **기능 단위 탐색 곤란**: "예약" 기능을 이해하려면 `app/`·`components/`·`lib/`를 횡단해야 한다.

## 결정

프론트엔드를 **Feature-Sliced Design(FSD) 레이어 구조**로 재편한다. Next.js App Router와의 충돌(`app/` 디렉터리 예약)을 고려해 다음 적응안을 택한다.

- **`src/` 하위 레이어 + 얇은 라우팅**: 모든 FSD 레이어를 `src/` 아래 둔다. Next 라우팅은 `src/app/`(Next가 공식 지원)으로 옮겨 **라우팅 전용 얇은 레이어**로 유지한다. 각 `src/app/**/page.tsx`는 `src/views/<route>`를 재노출(`export { default } from '@/views/<route>'`)만 한다. `src/app/`는 Next 라우터 겸 FSD `app` 레이어(루트 레이아웃·providers·전역 스타일·API Route Handler) 역할을 겸한다.
- **단일 경로 alias**: `tsconfig.json`의 `@/* → ./src/*` 하나로 라우팅·FSD 레이어를 모두 커버한다.
- **레이어**: `app(라우팅) → views → widgets → features → entities → shared`. 상위 레이어는 자신보다 하위 레이어만 import한다.
- **Public API 배럴**: `entities`/`features`/`widgets`/`views`의 각 슬라이스는 `index.ts`로 공개 API를 노출한다. 슬라이스 간 import는 반드시 `index.ts`만 경유한다(내부 경로 deep-import 금지).
- **도메인 슬라이싱**: `lib/types.ts`·`lib/api-client.ts`를 해체해 11개 entity(session·booking·availability·schedule·test-result·consultation-record·analytics·family-link·notification·product·challenge)의 `model`/`api`/`ui`로 분배한다. 교차 원시 union(`Role`·`Outcome`·`BookingStatus` 등)은 `shared/config`로, HTTP 코어·`toFriendlyMessage`는 `shared/api`로, 쿠키/토큰(server-only)은 `shared/auth`로, 포맷터는 `shared/lib/format`로 이동한다.

### FSD "pages" → `views` 명명

FSD 표준 레이어명은 `pages`지만, Next.js의 레거시 **Pages Router** 디렉터리명(`pages/`)과의 혼동을 피하기 위해 해당 레이어를 **`src/views/`**로 명명한다(본 프로젝트는 App Router만 사용). 라우트 컴포지션(페이지 본문)은 `src/views/<route>/ui/<Name>Page.tsx`에 둔다.

## 대안

| 안 | 내용 | 기각 사유 |
|---|---|---|
| **A-2. 루트 레벨 FSD 레이어** | `shared`/`entities`/… 를 `app/` 옆 저장소 루트에 배치(`src/` 없음) | Next 설정 파일과 FSD 레이어가 한 디렉터리에 섞이고, `@/` alias가 라우팅·레이어를 깔끔히 구분하기 어렵다. |
| **A-3. 엄격 분리 app 레이어** | `src/app`(FSD) 와 Next 라우팅을 별도 디렉터리로 완전 분리 | App Router 관례와 마찰이 크고 churn 대비 이득이 적다. "얇은 라우팅" 목표와 상충. |
| **B. steiger 린터 + ESLint 경계 강제** | 폴더 재편 + 기계적 import 경계 강제 도구 도입 | 본 단계 목표는 구조 정착. 도구 도입은 후속 과제로 분리(YAGNI). 현재는 **규칙 + Public API 배럴** 컨벤션으로 충분. |
| **C. 폴더만 이동(배럴 없음)** | 파일만 레이어로 재배치 | 슬라이스 경계가 코드로 표현되지 않아 deep-import가 재발. |

## 결과

- **검증**: `pnpm typecheck`·`pnpm test`(16)·`pnpm build`(8개 라우트) green. 경계 grep 0 위반(`@/lib`·`@/components`·`_components` 잔존 0, entities/shared의 상위 레이어 import 0).
- **점진 이행**: `shared → entities → widgets → features → views/라우팅` 순으로 각 단계 green gate 유지하며 커밋. 레거시 `lib/`·`components/`는 마지막에 제거.
- **트레이드오프**: 슬라이스 수 증가로 파일 개수가 늘고, 동일 import 한 줄이 여러 배럴로 분할된다. 경계는 도구가 아닌 **컨벤션**으로만 강제되므로, 향후 위반이 잦아지면 steiger/ESLint 경계(대안 B)를 도입할 수 있다.
- **교차 entity 결합**: 예약 UI가 검사 결과서를 참조하거나 analytics가 `Outcome`을 쓰는 등 일부 교차 참조는 각 entity의 Public API를 경유해 허용한다(엄격 `@x` 교차 import 표기는 미도입).
