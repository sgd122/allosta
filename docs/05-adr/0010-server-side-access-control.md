# ADR 0010 — 서버측 접근제어 미들웨어 + JWT 서명 검증

- **상태**: Accepted
- **날짜**: 2026-06-10
- **관련**: [04-system-design §8 권한 2층](../04-system-design.md#8-권한-2층-설계), [§9.3 JWT 흐름](../04-system-design.md#93-jwt-흐름-프론트엔드), [0009 frontend-fsd](./0009-frontend-fsd-architecture.md)

**결정 (한 줄):** Edge 미들웨어(`src/middleware.ts`)를 추가해 보호 라우트에 서버측 JWT 서명 검증을 적용하고, 서명 미검증 `decodeToken()` 경로를 제거한다.

## 맥락

초기 프론트엔드 인증은 다음 두 약점이 있었다.

1. **보호 페이지의 서버측 가드 부재**: `(admin)`·`(counselor)`·`(customer)` 라우트 그룹은 정적 프리렌더된 클라이언트 shell이었고, `middleware.ts`가 존재하지 않았다. 그 결과 `/dashboard`·`/schedule` 등이 **쿠키 없이도 200**으로 응답했다. 실제 데이터는 백엔드 API가 보호하므로 즉시 유출은 아니지만, "SSR/서버측 역할 보호"가 요구사항이면 미충족이었다. 아키텍처 다이어그램·README는 미들웨어 보호를 *주장*했으나 코드가 없었다.
2. **서명 미검증 디코드를 권한 판단에 사용**: `shared/auth`의 `decodeToken()`은 서명 검증 없이 payload만 파싱했고, 이를 `/api/auth/me`와 루트 `/` 리다이렉트가 사용했다. 조작된 쿠키 payload가 UI 권한 판단·라우팅에 영향을 줄 수 있었다.

## 결정

**Edge 미들웨어 기반 서버측 접근제어 층**을 추가하고, 모든 권한·라우팅 판단을 **서명 검증된 클레임** 위에서만 수행한다.

- **`src/middleware.ts`** (Next가 `src/` 프로젝트에서 요구하는 위치): 보호 prefix 요청에 대해 쿠키 JWT를 검증하고 아래 세 경우를 처리한다.
  - 미인증·위조·만료 → `307 /login` (+ 쿠키 삭제)
  - 역할 불일치 → 본인 홈(`homePathForRole`)으로 `307`
  - 정상 → 통과
  `config.matcher`로 7개 보호 prefix만 매칭한다(`/login`·`/`·`/api/**`·정적 자산 무관).
- **서명 검증 (`shared/auth/verify.ts`)**: `jose.jwtVerify`로 **서명 + `exp` 검증**을 수행한다. 알고리즘을 `algorithms: ['HS256']`로 고정하고 `requiredClaims: ['exp']`로 **만료 없는 토큰을 거부**한다(서명만 유효한 무기한 토큰 차단). 백엔드와 동일한 `JWT_SECRET`을 사용한다. 코드 fallback(`dev-only-change-me-in-production`)을 FE·BE 양쪽 `.env.example`에 **단일 값으로 통일**한다(불일치 시 토큰 검증 실패 → 무한 `/login` 되튕김 방지). 프로덕션에서 `JWT_SECRET` 부재 시 **fail-closed**(throw → 모든 토큰 무효 처리)로 동작해, 잘 알려진 기본 secret을 신뢰해 위조 토큰을 통과시키지 않는다. `jose`를 택한 이유는 미들웨어가 도는 **Edge 런타임 호환**(Node 전용 `jsonwebtoken` 불가). `server-only`/`next/headers`를 import하지 않아 미들웨어·Route Handler·Server Component가 모두 재사용한다.
- **접근 정책 (`shared/auth/access.ts`)**: 라우트→역할 매핑(`requiredRoleForPath`)과 역할→홈(`homePathForRole`)을 순수 함수로 단일화한다. 라우트 그룹의 단일 진실원이다.
- **`decodeToken` 제거**: 서명 미검증 디코드 경로를 삭제한다. `/api/auth/me`와 `/`는 `verifySession`(검증)으로 전환해, 조작 쿠키는 401/리다이렉트로 처리한다.
- **방어 심층화**: 미들웨어는 1차(접근제어) 층, NestJS는 2차(서명 + 자원 소유권, 데이터 경계) 층이다. 상호 대체가 아니다.

## 대안

| 안 | 내용 | 기각 사유 |
|---|---|---|
| **A. 미들웨어 없이 백엔드만 신뢰** | 현행 유지, 모든 보호를 NestJS API에 위임 | 보호 페이지가 인증 없이 200 — "서버측 역할 보호" 요구 미충족. 다이어그램/README와 코드 불일치 지속. |
| **B. 페이지/레이아웃 서버 컴포넌트에서 가드** | 각 route group `layout.tsx`에서 `cookies()` 검증 후 redirect | 그룹마다 중복, 정적 프리렌더 포기 강제. 미들웨어가 한 곳에서 더 단순하고 정적 shell 유지. |
| **C. 미들웨어에서 디코드만(서명 미검증)** | presence + payload role만 확인 | MEDIUM 결함(조작 쿠키 영향) 미해결. 검증 비용은 대칭키 HMAC로 무시할 수준. |
| **D. `/api/auth/me`가 백엔드 검증 엔드포인트 호출** | NestJS에 `/auth/me` 추가 후 프록시 | 백엔드 신규 엔드포인트 필요. 대칭키 로컬 검증으로 충분하고 왕복 비용 절감. |

## 결과

- **검증**: `pnpm typecheck`·`pnpm lint`(0)·`pnpm test`(36, +20)·백엔드 `tsc` green. 추가 테스트: `exp` 부재 토큰 거부, 비-HS256(HS512) 거부, 프로덕션 secret 부재 fail-closed, 역할 홈 라운드트립 불변(리다이렉트 루프 방지), 보호 라우트 드리프트 가드(`access.routes.test.ts` — 디스크 라우트 그룹 ↔ `ROUTE_ROLES` ↔ `config.matcher` 3중 동기화). 런타임 스모크(prod `next start`):
  - 쿠키 없음: `/dashboard`·`/book`·`/` → `307 /login`
  - 위조 서명 쿠키: `/dashboard` → `307 /login`
  - 유효 CUSTOMER: `/book` → `200`, `/dashboard`·`/schedule` → `307 /book`
  - `/login` → `200` (무영향)
- **품질 게이트**: `pnpm lint`(`next lint` + `eslint-config-next`) 신규 추가 — 기존엔 lint 스크립트가 없었다.
- **트레이드오프**: 프론트엔드가 `JWT_SECRET`을 알아야 한다(서버측 전용, 클라이언트 번들 미노출). 백엔드와 secret 동기화 필요 — `.env.example`에 명시. 향후 비대칭(RS256) 전환 시 프론트는 공개키만 보유하도록 바꿀 수 있다.
- **정적 렌더링 유지**: 미들웨어가 요청 시점에 가로채므로 보호 페이지는 정적 shell(`○`)로 남되, 미인증/오역할 사용자는 shell을 받기 전에 리다이렉트된다.
