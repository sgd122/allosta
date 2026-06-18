# ADR 0011 — 프론트엔드 스타일링(Tailwind on Radix) · 클라이언트 상태(Jotai) · API 훅 레이어

- **상태**: Accepted
- **날짜**: 2026-06-10
- **관련**: [04-system-design §9.2.2](../04-system-design.md#922-스타일링·상태·api-훅-레이어-adr-0011), [0009 frontend-fsd-architecture](./0009-frontend-fsd-architecture.md)

**결정 (한 줄):** Tailwind를 Radix Themes 위에 레이어링해 디자인 토큰을 일원화하고, 서버 상태는 TanStack Query·클라이언트 상태는 Jotai·API 훅은 슬라이스별 `queries.ts`로 표준화한다.

## 맥락

FSD 구조(ADR 0009) 정착 이후, 세 가지 횡단 관심사에 컨벤션이 없었다.

1. **스타일이 인라인 `style={{ ... var(--teal-11) ... }}`로 분산**(16개 컴포넌트). 디자인 토큰(이브로우 라벨·serif 헤딩·KPI 숫자·진행 바)이 코드로 표현되지 않고 파일마다 복붙·표류한다.
2. **`useQuery`/`useMutation`이 뷰/피처 호출부에 인라인**으로 흩어져 `queryKey` 문자열이 중복된다. 무효화 키가 호출부마다 손으로 반복되어 캐시 동일성 표류 위험이 있다.
3. **클라이언트 상태 관리 표준 부재**.

## 결정

### 1. Tailwind v3를 Radix Themes "위에" 레이어링

- **공존 모델**: Radix Themes가 컴포넌트 프리미티브·런타임 테마(색/반경 CSS 변수)를 소유하고, Tailwind는 레이아웃·간격·타이포·일회성 스타일을 소유한다. Radix를 걷어내지 않는다.
- **preflight OFF**: Radix가 자체 CSS reset을 제공하므로 Tailwind base reset은 끈다. 그 결과 맨 `border` 유틸은 색이 없으므로 항상 색과 함께 쓴다(`border border-gray-5`).
- **토큰 매핑**: `tailwind.config.ts`가 색 스케일(`teal`·`gray`·`amber`·`red`·`blue`·`violet` 1–12)과 반경(`rounded-1..4`)을 **Radix 런타임 CSS 변수에 매핑**한다(`text-teal-11` → `color: var(--teal-11)`). 값 중복이 0이고, Radix가 팔레트를 스왑(예: 다크모드)하면 Tailwind 클래스도 자동으로 따라간다. 폰트는 `font-serif`(Newsreader)·`font-mono`(IBM Plex Mono)로 매핑한다.
- **반복 제거**: 재등장하는 토큰 조합은 `shared/ui` 프리미티브로 1회 정의한다 — `Eyebrow`(mono/대문자/teal 라벨), `StatNumber`(serif KPI 숫자), `Meter`(진행 바). 동적 톤 색은 **정적 클래스 맵**(`shared/ui/tone.ts`의 `toneText`/`toneFill`)으로 변환한다. `text-${tone}-11` 같은 템플릿 문자열 클래스는 Tailwind가 purge하므로 금지한다.
- **globals.css**: keyframes(`rise`)·로그인 화면 그라디언트/오빗 등 **진성 CSS만** 유지하고, 컴포넌트 인라인 토큰 스타일은 제거한다.

### 2. 서버 상태 = TanStack Query, 클라이언트 상태 = Jotai

- `providers.tsx`에 Jotai `Provider`를 추가(요청별 atom store 격리 → SSR 안전). TanStack Query는 서버 상태(패칭·캐시·뮤테이션), Jotai는 공유 클라이언트 상태를 담당한다.
- **over-적용 금지**: 현재 진성 공유 클라이언트 상태가 적어 atom은 필요 시 도입한다. 로컬 UI 상태(다이얼로그 open, 페이지 번호, 폼 입력)는 `useState`로 둔다(React 상태 위치 원칙).

### 3. 슬라이스별 API 훅 레이어

- 각 entity `api/queries.ts`에 **`<slice>Keys` queryKey 팩토리 + `useX()` 쿼리 훅 + `useXMutation()` 뮤테이션 훅**을 둔다. 기존 fetcher 함수는 저수준 계층으로 유지(훅이 이를 래핑).
- 뷰/피처는 인라인 `useQuery` 대신 슬라이스 배럴에서 훅을 소비한다. 뮤테이션 훅이 캐시 무효화를 책임지고, 호출부는 per-call `onSuccess`로 UI 부수효과(모달 닫기·폼 리셋·낙관적 업데이트)를 얹는다(TanStack v5에서 훅·호출부 콜백 모두 실행).

## 대안

| 안 | 내용 | 기각 사유 |
|---|---|---|
| **Radix 전면 제거 후 Tailwind 단독** | `@radix-ui/themes` 제거 + headless 프리미티브로 전 UI 재작성 | 최근 정착된 폴리시드 UI 대규모 재작성. churn 대비 이득 없음. |
| **globals.css 유지만** | 인라인 스타일 정리 없이 시맨틱 클래스만 유지 | 인라인 `var()` 잔존 — 요구(토큰의 Tailwind화)와 상충. |
| **Zustand / React Context** | 클라이언트 상태 라이브러리 대안 | 원자 단위·최소 보일러플레이트·devtools 측면에서 Jotai 채택. Context는 고빈도 갱신에 부적합. |
| **훅 미통합(인라인 유지)** | queryKey를 호출부 인라인 유지 | 키 문자열 중복·표류, 무효화 누락 위험. |

## 결과

- **검증**: `pnpm typecheck` · `pnpm test` · `pnpm lint` · `pnpm build`(15개 라우트) green.
- **불변식 grep**: 컴포넌트 인라인 `var()` 0, 호출부 raw `useQuery(`/`useMutation(` 0, 템플릿 문자열 Tailwind 클래스 0.
- **캐시 동일성 보존**: 모든 `queryKey`·옵션(`staleTime`·`refetchInterval`·`enabled`·`placeholderData`)을 인라인 원본과 동일하게 유지 → 캐시 동작 무변경.
- **트레이드오프**: 슬라이스마다 `queries.ts` 추가로 파일 수가 늘고, Tailwind 클래스 문자열이 길어진다. preflight OFF로 `border`·`ring` 유틸은 명시 색이 필요하다(컨벤션으로 강제, `tailwind.config.ts` 주석에 명시).
