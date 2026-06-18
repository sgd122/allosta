# AGENTS.md

## 프로젝트 개요

**Allosta** — BioCom(검사 → 상담 → 관리 프로그램)의 상담 예약·전환 분석 플랫폼. 2주 평가용 take-home 과제다.

**핵심 성격: 채점의 1차 대상은 코드가 아니라 `docs/`의 설계 문서다.** 코드는 golden path(예약 → 상담사 확정 → 상담 기록 + 챌린지 등록 → 전환 집계) 1개를 동작·테스트로 증명하는 보조 증거다. 코드만 고치고 문서를 방치하면 과제 목적에 어긋난다.

| 레이어 | 스택 | 포트 |
|--------|------|------|
| `frontend/` | Next.js 14 App Router · React 18 · TanStack Query · Radix Themes + Tailwind | 5173 |
| `backend/` | NestJS 10 · Prisma 5 · Passport JWT · @nestjs/schedule | 3000 |
| DB | PostgreSQL 16 (docker compose) | 5432 |

**모노레포지만 워크스페이스가 아니다** (ADR 0005). 루트에 `package.json`이 없고 `backend/`·`frontend/`가 각자 `pnpm-lock.yaml`을 가진다 — 루트에서 `pnpm install`을 실행하지 말고 각 디렉터리에서 따로 설치한다.

**설계 결정의 단일 출처는 `docs/`다** — [`docs/04-system-design.md`](docs/04-system-design.md)(ERD·시퀀스·API·동시성)와 [`docs/05-adr/`](docs/05-adr/)(ADR 18종). 구현 판단이 갈리면 ADR을 먼저 읽는다.

## 사전 요건

- Docker + Docker Compose
- Node.js ≥ 20, pnpm ≥ 9
- 외부 계정·API 키 **불필요** (LLM은 로컬 Ollama가 선택적, 없으면 결정론 폴백)

## 셋업 명령어

```bash
# 1. PostgreSQL (레포 루트)
docker compose up -d                      # db/user/pw 모두 allosta

# 2. 백엔드
cd backend
cp .env.example .env                      # 기본값으로 바로 동작
pnpm install
pnpm prisma:generate                      # Prisma Client 생성
pnpm prisma:migrate                       # 마이그레이션 적용 (raw SQL 제약 포함)
pnpm seed                                 # 데모 데이터
pnpm start:dev                            # :3000 · Swagger /api/docs

# 3. 프론트엔드
cd frontend
cp .env.example .env.local                # JWT_SECRET이 backend/.env와 같아야 함
pnpm install
pnpm dev                                  # :5173
```

시드 계정은 전부 비밀번호 `demo1234`: `customer@demo.com`(고객) · `counselor@demo.com`·`counselor2@demo.com`(상담사) · `admin@demo.com`(관리자) · `family@demo.com`(가족 연동 고객).

## 개발 워크플로우

```bash
# 백엔드
pnpm start:dev                            # watch 모드
pnpm build && pnpm start:prod             # 프로덕션 (dist/src/main.js)
pnpm exec ts-node scripts/trigger-scheduler.ts   # 알림 스케줄러 즉시 발화

# 프론트엔드
pnpm dev                                  # next dev -p 5173
pnpm build                                # next build
```

**백엔드에는 lint·typecheck 스크립트가 없다** — `nest build`(= `tsc`)가 타입 검사를 겸한다. 프론트엔드만 `pnpm typecheck`(`tsc --noEmit`) · `pnpm lint`(`next lint`)를 가진다.

## 테스트

```bash
# 백엔드 통합 (NestJS + supertest)
cd backend
pnpm test:db:setup                        # 최초 1회 — allosta_test DB 생성
pnpm test                                 # = test:e2e, jest --runInBand

# 프론트엔드 단위 (vitest)
cd frontend
pnpm test

# 브라우저 E2E (Playwright) — 백엔드 :3000 + seed 선행 필요
pnpm exec playwright install chromium     # 최초 1회
pnpm test:e2e                             # :5173 dev 서버는 자동 기동
```

**러너별 스코프가 엄격히 분리돼 있다.** 새 테스트는 반드시 해당 위치에 둔다:

| 러너 | 스코프 | 파일 패턴 |
|------|--------|-----------|
| jest (backend) | `backend/test/` | `*.spec.ts` · `*.e2e-spec.ts` |
| vitest (frontend) | `frontend/src/**` | `*.test.ts` · `*.spec.ts` |
| playwright (frontend) | `frontend/e2e/` | `*.spec.ts` |

vitest 설정의 `include: ['src/**/*.{test,spec}.{ts,tsx}']`가 Playwright 스펙과의 충돌을 막는다 — `e2e/` 스펙은 `@playwright/test`를 import해서 vitest에서 실행되면 크래시한다.

**테스트 작성 규칙:**
- 백엔드 스펙은 `seedIsolated` 아일랜드로 자기 데이터를 소유한다. 데모 seed에 의존하지 않는다.
- **전체 스위트 개수를 하드코딩하는 assertion을 쓰지 않는다.** 회귀는 green/red로 판정한다. 문서에도 테스트 수를 고정 수치로 적지 않는다.
- 새 엔드포인트를 추가하면 RBAC(역할) + 소유권(자원) 거부 케이스를 함께 커버한다.

## 코드 스타일

**TypeScript**: 프론트 `strict: true`, 백엔드 `strictNullChecks` + `noImplicitAny`. 프론트 경로 별칭 `@/*` → `frontend/src/*`.

**프론트엔드 — FSD(Feature-Sliced Design)** (ADR 0009/0012):

```
app → views → widgets → features → entities → shared
```

- import는 **위 방향에서 아래 방향으로만** 흐른다. 하위 레이어가 상위를 import하면 위반.
- `entities`/`features`/`widgets`/`views`의 모든 슬라이스는 `index.ts` 배럴을 가지고, 소비는 배럴 경유로만 한다.
- `src/app/**/page.tsx`는 **views 재노출만** 한다 (로직·JSX 금지).
- 세그먼트: `api` · `types` · `ui` · `lib` · `constants` (`features`는 로직용 `model` 유지).
- 서버 상태는 TanStack Query가 담당한다 (ADR 0011은 공유 클라이언트 상태를 Jotai로 정했으나 현재 코드에는 아직 도입되지 않았다 — 필요해지면 그때 ADR대로 추가한다). **각 슬라이스가 자기 데이터 접근을 소유**한다 — 슬라이스 밖 인라인 `useQuery` 금지, `queryKey`는 슬라이스별 팩토리 경유, 뮤테이션이 캐시 무효화 책임을 진다 (ADR 0011 §2–3).
- 스타일: Radix Themes가 컴포넌트 프리미티브·런타임 테마(색·반경 CSS 변수)를 소유하고 Tailwind가 레이아웃·간격·타이포를 소유한다. **preflight OFF**이므로 border 유틸리티는 짝을 맞춰 써야 하고, ``className={`bg-${tone}`}`` 같은 **템플릿 문자열 클래스는 purge되므로 금지** — 정적 톤 맵을 경유한다 (ADR 0011 §1).

**백엔드 — 권한 2층** (ADR 0010):

- `RolesGuard`가 *"이 역할이 이 엔드포인트를 호출해도 되는가"*, `OwnershipService`가 *"이 자원이 이 사용자의 것인가"*를 담당한다. 둘은 대체 관계가 아니다.
- 사용자 자원을 다루는 컨트롤러는 **양쪽 다** 통과시켜야 한다. 소유권은 본인 OR ACCEPTED `FamilyLink` 파트너.
- 모든 요청 바디는 `class-validator` DTO로 검증한다.
- 도메인 모듈: `auth` `booking` `availability` `consultation` `customer` `family` `test-result` `notification` `analytics` `qa` `ops-scheduler` `prisma` `common`.

**동시성 — 애플리케이션 락이 아니라 DB 제약** (ADR 0002/0015):

- 슬롯 중복 예약은 **부분 unique 인덱스**, 고객 시간대 중복은 **GiST EXCLUDE**가 막는다.
- **이 제약들은 Prisma가 표현하지 못해 `backend/prisma/migrations/`의 raw SQL에만 존재한다.** `schema.prisma`만 보고 판단하면 틀린다. 마이그레이션을 재작성할 때 이 SQL을 떨어뜨리면 동시성 방어가 조용히 사라진다.
- 애플리케이션은 위반 코드(`P2002` / `23P01`)를 잡아 409로 변환한다.

**어댑터 경계 — 비결정성 격리** (ADR 0004/0014/0018):

- `NotificationChannelAdapter`(알림 채널) · `GuidanceGenerator`(상담 가이던스) · `QaAnswerGenerator`(고객 Q&A)는 같은 패턴을 반복한다: `available()`로 fail-soft 판정 + **결정론 템플릿 폴백**.
- **Ollama가 없어도 모든 경로가 200으로 동작해야 한다.** LLM 실패를 5xx로 흘리지 않는다.

## 검증 스킬 (`.claude/skills/`)

테스트가 강제하지 **않는** 정적 컨벤션의 기계적 가드. 해당 영역을 수정한 뒤 호출한다:

| Skill | 언제 |
|-------|------|
| `verify-fsd-boundaries` | `frontend/src` 파일 추가·이동·import 변경 후 |
| `verify-query-layer` | entity `api` 세그먼트나 데이터를 읽는 뷰/피처 수정 후 |
| `verify-design-tokens` | 컴포넌트 스타일·`tailwind.config.ts` 수정 후 |
| `verify-backend-authz` | 컨트롤러·라우트·DTO 추가·수정 후 |
| `verify-db-constraints` | Prisma 스키마·마이그레이션·예약/가족 로직 변경 후 |
| `verify-adapter-boundaries` | 알림 채널·LLM 생성기 추가·수정 후 |
| `verify-docs-sync` | 코드 변경 후, 그리고 제출 전 |

런타임 동작은 기존 테스트가 커버한다 — 스킬과 테스트는 겹치지 않는다.

## 함정

- **백엔드 테스트는 별도 `allosta_test` DB를 쓴다.** DB가 없으면 실패하므로 `pnpm test:db:setup`을 한 번 돌려야 한다. jest `globalSetup`이 매 실행마다 `prisma migrate reset --force --skip-seed`로 초기화하므로, 데모 seed가 든 dev DB(`allosta`)는 건드리지 않는다. 테스트 DB에 데모 seed를 넣지 마라 — 가용 캘린더 집계가 스펙 슬롯을 가려 격리 버그를 만든다.
- **`frontend/.env.local`의 `JWT_SECRET`은 `backend/.env`와 반드시 같아야 한다.** 다르면 로그인은 성공하지만 Next.js 미들웨어의 서명 검증에서 `/login`으로 되튕긴다.
- **프론트 → 백엔드 호출은 전부 `/api/proxy/**` 라우트 핸들러 경유**다 (httpOnly 쿠키 → `Authorization` 헤더 변환). CORS 설정이 없으므로 클라이언트에서 `NESTJS_URL`을 직접 부르면 실패한다. `NESTJS_URL`은 서버 전용이다.
- **테스트 환경은 Ollama를 죽은 포트(`127.0.0.1:1`)로 고정**한다 (`jest-setup-env.ts`). 로컬에 `ollama serve`가 떠 있어도 결정론 FALLBACK 경로가 나오도록 만든 의도적 설정이다. UPGRADED 경로가 필요한 스펙은 `OllamaSummarizer`를 Nest 테스트 모듈에서 직접 스텁한다.
- **Playwright는 `workers: 1`, `fullyParallel: false`**다. Next dev의 라우트별 lazy compile이 병렬 실행 시 타임아웃을 넘겨서 내린 결정이니 되돌리지 마라.

## 커밋 · PR 규칙

- **Conventional Commits**: `feat(scope): ...` · `fix(scope): ...` · `docs: ...` · `test(scope): ...` · `refactor: ...` · `chore: ...`. 스코프는 도메인/레이어(`qa`, `booking`, `web`, `db`, `analytics`, `e2e`).
- **브랜치**: `feat/` · `fix/` · `docs/` · `chore/` · `refactor/` + kebab-case 요약.
- **PR 전 체크**: 백엔드 `pnpm test`, 프론트엔드 `pnpm typecheck && pnpm lint && pnpm test`, 관련 verify 스킬.
- `main`에 직접 커밋하지 말고 브랜치를 파서 PR로 머지한다.

## 문서 동기화 (필수)

코드를 바꾸면 **같은 변경에서** 영향받는 산출물을 함께 갱신한다:

| # | 산출물 |
|---|--------|
| 1 | `docs/01-problem-definition.md` |
| 2 | `docs/02-requirements.md` (FR/NFR + 수용기준 AC) |
| 3 | `docs/03-mvp-scope.md` |
| 4 | `docs/04-system-design.md` + `docs/05-adr/` |
| 5 | `backend/` · `frontend/` |
| 6 | `README.md` |

새 설계 결정은 기존 문서를 고쳐 쓰지 말고 `docs/05-adr/`에 ADR을 추가한다(현재 0018까지). 마지막에 `verify-docs-sync`로 검증한다.
