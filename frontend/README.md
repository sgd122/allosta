# Allosta Frontend

Allosta 상담 예약·전환 분석 플랫폼의 프론트엔드 애플리케이션.

**스택:** Next.js 14 (App Router) · React 18 · TypeScript · TanStack Query v5 · Radix Themes · recharts

---

## 주요 설계 결정

### JWT를 httpOnly 쿠키에 격리

클라이언트 JS가 JWT에 직접 접근할 수 없도록 httpOnly 쿠키(`allosta_session`)에 저장합니다.
`/api/auth/login` Route Handler가 NestJS로부터 받은 토큰을 쿠키로 설정하고, 이후 모든 API 요청은
`/api/proxy/**` Route Handler를 통해 쿠키에서 토큰을 추출해 `Authorization: Bearer` 헤더로 변환합니다.

### 서버 측 역할 기반 리다이렉트

루트 라우트(`src/app/page.tsx`)가 서버에서 세션 쿠키의 JWT를 디코드해 역할을 확인하고 역할별 홈으로 리다이렉트합니다(미서명 검증 — 라우팅/표시 용도). 실제 인증·인가 검증은 NestJS가 모든 API 요청에서 수행합니다.

### Feature-Sliced Design(FSD) 아키텍처

프론트엔드는 FSD 레이어 구조를 따릅니다 — 자세한 결정 배경은 [ADR 0009](../docs/05-adr/0009-frontend-fsd-architecture.md) 참조.

| 경로 | 필요 역할 |
|------|---------|
| `/book`, `/bookings`, `/results` | CUSTOMER |
| `/schedule`, `/performance` | COUNSELOR |
| `/dashboard` | ADMIN |

---

## 개발 서버 실행

> 백엔드(`localhost:3000`)와 PostgreSQL이 먼저 기동되어 있어야 합니다.
> 루트 README의 [빠른 시작](../README.md#4-빠른-시작-golden-path-재현) 참조.

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

### 기타 명령어

```bash
pnpm build        # 프로덕션 빌드
pnpm start        # 프로덕션 서버 실행 (pnpm build 후)
pnpm typecheck    # TypeScript 타입 검사 (tsc --noEmit)
```

---

## 라우트 구조 (얇은 라우팅 레이어)

각 `page.tsx`는 `src/views/<route>`를 재노출(`export { default } from '@/views/<route>'`)하는 얇은 파일이며, 실제 페이지 본문은 `views` 레이어에 있습니다.

```
src/app/
├── page.tsx                      # 루트 → 역할별 리다이렉트 (서버, 쿠키 JWT 디코드)
├── providers.tsx                 # TanStack Query · Radix Theme providers
├── layout.tsx                    # 루트 레이아웃
├── login/page.tsx                # → @/views/login (로그인 폼, 공개)
├── (customer)/                   # CUSTOMER 역할 전용
│   ├── book/page.tsx             # → @/views/book
│   ├── bookings/page.tsx         # → @/views/bookings
│   └── results/page.tsx          # → @/views/results
├── (counselor)/                  # COUNSELOR 역할 전용
│   ├── schedule/page.tsx         # → @/views/schedule
│   └── performance/page.tsx      # → @/views/performance
├── (admin)/                      # ADMIN 역할 전용
│   └── dashboard/page.tsx        # → @/views/dashboard
└── api/
    ├── auth/login/route.ts       # POST — NestJS 로그인 → httpOnly 쿠키 설정
    ├── auth/logout/route.ts      # POST — 쿠키 삭제
    ├── auth/me/route.ts          # GET — 현재 사용자 정보
    └── proxy/[...path]/route.ts  # 모든 NestJS API 프록시 (쿠키 → Bearer 변환)
```

---

## 데모 계정

| 역할 | 이메일 | 비밀번호 | 비고 |
|------|--------|----------|------|
| 고객 (CUSTOMER) | `customer@demo.com` | `demo1234` | FamilyMember·TestResult 포함 |
| 상담사 1 (COUNSELOR) | `counselor@demo.com` | `demo1234` | — |
| 상담사 2 (COUNSELOR) | `counselor2@demo.com` | `demo1234` | — |
| 관리자 (ADMIN) | `admin@demo.com` | `demo1234` | — |
| 가족 계정 (CUSTOMER) | `family@demo.com` | `demo1234` | customer FamilyMember와 연결 |

---

## 프로젝트 구조 (Feature-Sliced Design)

레이어 import 방향은 한 방향입니다: `app(라우팅) → views → widgets → features → entities → shared`.
슬라이스 간 import는 각 슬라이스의 `index.ts`(Public API)만 경유합니다. 자세한 배경은 [ADR 0009](../docs/05-adr/0009-frontend-fsd-architecture.md).

```
frontend/src/
├── app/          # 얇은 Next 라우팅 + FSD app 레이어 (루트 레이아웃·providers·API Route Handler)
├── views/        # 라우트별 페이지 컴포지션 (FSD "pages" 레이어, Next pages-router 혼동 방지로 views 명명)
│   └── {login,book,bookings,results,schedule,performance,dashboard,availability}/
├── widgets/      # 교차 도메인 복합 UI (app-shell, notification-bell)
├── features/     # 사용자 액션 (book-consultation, create-consultation-record, manage-family-links)
├── entities/     # 도메인 단위 model·api·ui
│   └── {session,booking,availability,schedule,waitlist,test-result,
│        consultation-record,analytics,family-link,notification,product,challenge}/
└── shared/       # 도메인 무관 재사용 (api, auth, config, lib/format)
```

각 entity 슬라이스는 `model/`(타입) · `api/`(API 함수) · `ui/`(컴포넌트) · `index.ts`(Public API)로 구성됩니다.
