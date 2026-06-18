---
name: verify-query-layer
description: TanStack Query 훅 레이어 규약(슬라이스별 queryKey 팩토리, 배럴 경유 훅 소비, 뮤테이션의 캐시 무효화 책임)을 검사합니다. entity api 세그먼트나 데이터를 읽는 뷰/피처를 수정한 후 사용.
---

# 쿼리 레이어 규약 검증

[ADR 0011 §2–3](../../../docs/05-adr/0011-frontend-styling-state-api-hooks.md)은 서버 상태를 TanStack Query에, 클라이언트 상태를 Jotai에 두고, **각 슬라이스가 자기 데이터 접근을 소유**하도록 결정했다.

```
api/index.ts      저수준 fetcher (pfetch 래핑)
api/keys.ts       <slice>Keys queryKey 팩토리
api/queries.ts    useX() 쿼리 훅 + useXMutation() 뮤테이션 훅
api/invalidation.ts  뮤테이션 후 무효화 규칙 (+ 단위 테스트)
index.ts          슬라이스 배럴 — 위를 전부 재노출
```

핵심 규칙은 **뮤테이션 훅이 캐시 무효화를 책임진다**는 것이다. 호출부는 `onSuccess`로 UI 부수효과(모달 닫기·폼 리셋)만 얹는다. 뷰가 인라인으로 `useMutation`을 쓰면 그 무효화가 그 호출부에만 존재하게 되어, 같은 데이터를 바꾸는 두 번째 화면이 생겼을 때 **한쪽만 갱신되는 버그**가 난다.

`invalidation.test.ts`가 무효화 *규칙*은 검증하지만, **누가 그 규칙을 우회하는지는 아무것도 검사하지 않는다.**

## 목적

1. **훅 배럴 소비** — 뷰/피처/위젯이 슬라이스 배럴에서 훅을 가져다 쓴다
2. **인라인 쿼리 금지** — 슬라이스 밖에서 `useQuery`/`useMutation`을 직접 선언하지 않는다
3. **queryKey 팩토리** — 키 리터럴이 흩어지지 않고 `<slice>Keys`에 모인다
4. **무효화 책임** — 뮤테이션 훅이 `onSuccess`에서 무효화를 수행한다
5. **상태 분리** — 서버 상태는 Query, 공유 클라이언트 상태만 Jotai, 로컬 UI 상태는 `useState`

## 실행 시점

- `frontend/src/entities/*/api/`에 파일을 추가·수정한 후
- 뷰/피처에서 새 데이터를 읽거나 뮤테이션을 붙인 후
- 새 entity 슬라이스를 만든 후
- 캐시가 갱신되지 않는 버그를 조사할 때
- Pull Request 생성 전

## Related Files

| File | Purpose |
|------|---------|
| `docs/05-adr/0011-frontend-styling-state-api-hooks.md` | §2 상태 분리 · §3 슬라이스별 API 훅 레이어 결정 |
| `frontend/src/shared/api/index.ts` | `pfetch` HTTP 코어 + `toFriendlyMessage` |
| `frontend/src/entities/booking/api/keys.ts` | queryKey 팩토리 참조 구현 |
| `frontend/src/entities/booking/api/queries.ts` | 쿼리·뮤테이션 훅 참조 구현 |
| `frontend/src/entities/booking/api/invalidation.ts` | 무효화 규칙 |
| `frontend/src/entities/booking/api/invalidation.test.ts` | 무효화 단위 테스트 |
| `frontend/src/entities/booking/index.ts` | 슬라이스 배럴 (fetcher·훅·키·무효화 전부 재노출) |
| `frontend/src/entities/consultation-record/api/` | keys + queries + invalidation 전체 세트 |
| `frontend/src/entities/family-link/api/` | keys + queries + invalidation 전체 세트 |
| `frontend/src/entities/qa/api/keys.ts` | keys + queries (무효화 불필요 슬라이스) |
| `frontend/src/entities/test-result/api/keys.ts` | keys + queries |
| `frontend/src/entities/consultation-brief/api/keys.ts` | keys + queries |
| `frontend/src/app/providers.tsx` | QueryClient + Jotai Provider 설정 |

## 워크플로우

모든 명령은 `frontend/` 디렉토리에서 실행한다.

### Step 1: 슬라이스 밖 인라인 쿼리/뮤테이션

**검사:** `useQuery(`/`useMutation(` 선언은 `entities/*/api/`에만 존재해야 한다.

```bash
cd frontend
grep -rn 'useQuery(\|useMutation(\|useInfiniteQuery(' src/views src/features src/widgets src/app \
  --include='*.ts' --include='*.tsx'
```

**PASS:** 출력 0줄.

**FAIL:** 각 줄이 슬라이스 소유권을 우회한 지점이다. 훅을 해당 entity의 `api/queries.ts`로 옮기고 배럴에 export한 뒤, 호출부는 `const m = useCreateXMutation()` 형태로 소비한다. UI 부수효과는 호출부의 `m.mutate(vars, { onSuccess: ... })`에 얹는다 — TanStack v5는 훅과 호출부 콜백을 **둘 다** 실행하므로 무효화를 잃지 않는다.

> **현재 알려진 위반 1건** (스킬 생성 시점, 미수정):
> `src/features/complete-booking/ui/CompleteBookingDialog.tsx:48` — 인라인 `useMutation`.
> 1건을 기준선으로 삼고, 초과하면 새 위반이 유입된 것이다.

### Step 2: `useQueryClient` 직접 사용

**검사:** `useQueryClient`는 무효화를 하려는 신호다. 슬라이스 밖에서 쓰면 무효화 규칙이 그 파일에 갇힌다.

```bash
cd frontend
grep -rn 'useQueryClient' src/views src/features src/widgets --include='*.ts' --include='*.tsx'
```

**PASS:** 출력된 각 줄이 예외사항 1(로그아웃·세션 리셋 같은 **전역 캐시 클리어**)에 해당한다.

기준선(스킬 생성 시점) — 전부 정당한 전역 클리어:
```
src/views/login/ui/LoginPage.tsx:5        로그인 성공 후 이전 세션 캐시 제거
src/widgets/app-shell/ui/Layout.tsx:4     로그아웃 시 캐시 제거
src/features/complete-booking/ui/CompleteBookingDialog.tsx:4  ← Step 1 위반과 동반
```

**FAIL:** 특정 쿼리 키를 무효화하려고 쓰인 것이면 그 로직을 해당 슬라이스의 `api/invalidation.ts`로 옮긴다.

### Step 3: queryKey 팩토리

**검사:** 키 배열 리터럴이 훅 안에 직접 박히면 무효화 측과 어긋나도 아무도 모른다.

```bash
cd frontend
echo "--- keys.ts 보유 슬라이스 ---"
find src/entities -name 'keys.ts' | sort
echo "--- queries.ts는 있는데 keys.ts가 없는 슬라이스 ---"
for d in src/entities/*/api; do
  [ -f "$d/queries.ts" ] && [ ! -f "$d/keys.ts" ] && echo "NO keys.ts: $d"
done
echo "--- queryKey에 인라인 배열 리터럴 ---"
grep -rn "queryKey:\s*\[" src/entities --include='*.ts'
```

**PASS:** `queryKey:` 값이 전부 `<slice>Keys.*` 참조다. 인라인 배열 리터럴 0줄.

기준선(스킬 생성 시점): `NO keys.ts` 7줄(예외사항 2), 인라인 리터럴 0줄. `keys.ts` 보유 6개 — `booking` `consultation-record` `consultation-brief` `family-link` `qa` `test-result`. 나머지 슬라이스는 예외사항 2 참조.

**FAIL:** 인라인 리터럴을 `keys.ts`의 팩토리로 올린다. 무효화하는 쪽과 구독하는 쪽이 **같은 팩토리 함수**를 부르게 만드는 것이 목적이다.

### Step 4: 무효화 책임 소재

**검사:** 뮤테이션 훅이 `onSuccess`에서 무효화를 수행한다.

```bash
cd frontend
echo "--- 뮤테이션 훅 ---"
grep -rn 'export function use[A-Za-z]*Mutation' src/entities --include='queries.ts'
echo "--- 훅 내부 무효화 호출 ---"
grep -rn 'invalidateAfter\|invalidateQueries' src/entities --include='queries.ts'
echo "--- 무효화 모듈과 테스트 ---"
find src/entities -name 'invalidation.ts' -o -name 'invalidation.test.ts' | sort
```

**PASS:** 각 `use*Mutation`이 `onSuccess`를 가지며 그 안에서 `invalidateAfter*` 또는 `invalidateQueries`를 호출한다. 무효화 규칙이 있는 슬라이스는 `invalidation.test.ts`도 함께 갖는다.

**FAIL:** `onSuccess`가 없는 뮤테이션 훅은 캐시를 낡은 채로 둔다. 어떤 쿼리가 영향받는지 판단해 `invalidation.ts`에 규칙을 추가하고 훅에서 호출한다. 규칙을 추가했으면 **단위 테스트도 함께** 추가한다 — 기존 3개 슬라이스가 그 선례다.

### Step 5: 배럴 재노출 완결성

**검사:** 슬라이스 배럴이 훅·키·무효화를 전부 재노출해야 외부가 deep-import 없이 소비할 수 있다.

```bash
cd frontend
for d in src/entities/*/; do
  s=$(basename "$d")
  [ -f "$d/api/queries.ts" ] || continue
  hooks=$(grep -cE 'export function use' "$d/api/queries.ts")
  reexported=$(grep -cE "use[A-Za-z]+" "$d/index.ts")
  echo "$s: queries.ts 훅=$hooks, index.ts 재노출 참조=$reexported"
done
```

**PASS:** 훅을 정의한 슬라이스마다 `index.ts`가 그것들을 재노출한다(`export { useX, useXMutation, xKeys } from './api/queries';`).

**FAIL:** 배럴에 없는 훅은 외부에서 deep-import로만 쓸 수 있어 `verify-fsd-boundaries` Step 2 위반을 유발한다. 배럴에 추가한다.

### Step 6: 상태 분리 (Jotai over-적용)

**검사:** ADR 0011 §2는 Jotai atom을 **필요할 때만** 도입하기로 했다. 로컬 UI 상태(다이얼로그 open, 페이지 번호, 폼 입력)는 `useState`로 둔다.

```bash
cd frontend
echo "--- atom 정의 ---"; grep -rn 'atom(' src --include='*.ts' --include='*.tsx'
echo "--- Jotai Provider ---"; grep -n 'jotai\|Provider' src/app/providers.tsx
```

**PASS:** atom 정의가 **진성 공유 상태**(둘 이상의 형제 컴포넌트가 읽고 쓰는 것)에만 존재한다. Provider는 요청별 store 격리를 위해 `providers.tsx`에 있다.

**FAIL:** 서버 데이터를 atom에 복제하고 있다면 이중 출처다 — Query 캐시가 단일 출처여야 한다. 단일 컴포넌트 트리 안의 UI 상태를 atom으로 올렸다면 `useState`로 내린다.

### Step 7: 회귀 게이트

```bash
cd frontend && pnpm typecheck && pnpm lint && pnpm test
```

**PASS:** typecheck 0, lint 0, vitest green(`invalidation.test.ts` 3종 포함).

## Output Format

```markdown
## 쿼리 레이어 규약 검증

| # | 검사 | 결과 | 위반 |
|---|------|------|------|
| 1 | 슬라이스 밖 인라인 쿼리 | PASS / FAIL | N건 (기준선 1건 대비) |
| 2 | `useQueryClient` 직접 사용 | PASS / FAIL | (파일:줄) |
| 3 | queryKey 팩토리 | PASS / FAIL | (인라인 리터럴 위치) |
| 4 | 무효화 책임 소재 | PASS / FAIL | (훅명) |
| 5 | 배럴 재노출 완결성 | PASS / FAIL | (슬라이스) |
| 6 | 상태 분리 | PASS / FAIL | (atom 위치) |
| 7 | typecheck / lint / test | PASS / FAIL | |

### 수정 제안
(위반별 구체적 수정안)
```

## 예외사항

다음은 **위반이 아닙니다**:

1. **로그인·로그아웃의 `useQueryClient`** — `LoginPage.tsx`와 `app-shell/Layout.tsx`는 세션 경계에서 **캐시 전체를 비운다**. 특정 슬라이스의 무효화가 아니라 전역 리셋이므로 어느 슬라이스에도 속하지 않는다. 이 둘은 정상이다.
2. **`keys.ts`가 없는 슬라이스** — `analytics` `availability` `challenge` `notification` `product` `schedule` `session` 7개는 쿼리 수가 적고 무효화 대상이 아니라 `queries.ts` 안에 키를 두었다(`call-log`는 `queries.ts` 자체가 없어 이 목록에 나타나지 않는다 — 예외 3 참조). Step 3은 **인라인 배열 리터럴**을 잡는 것이 목적이며, 파일 분리 자체를 강제하지 않는다. 키가 팩토리 객체 형태로 `queries.ts`에 있으면 정상이다.
3. **`invalidation.ts`가 없는 슬라이스** — 읽기 전용 슬라이스(`analytics` `product` `schedule` 등)는 뮤테이션이 없어 무효화할 것도 없다. `call-log`는 `mutations.ts`만 갖는데, 무효화가 상위 `consultation-record` 슬라이스 책임이면 정상이다.
4. **`api/index.ts`가 배럴이 아니라 fetcher 모듈** — 이 프로젝트에서 `entities/*/api/index.ts`는 재노출 배럴이 아니라 `pfetch` 래퍼들을 담은 **저수준 계층**이다. 재노출은 슬라이스 루트 `index.ts`가 한다. 배럴 규약 위반으로 보고하지 마라.
5. **atom이 0개** — ADR 0011이 "over-적용 금지, 필요 시 도입"으로 명시했다. 진성 공유 상태가 아직 없어 atom이 하나도 없는 상태는 결정대로다. "Jotai 미사용"을 지적하지 마라.
6. **호출부의 `onSuccess`** — 뮤테이션 훅이 이미 무효화를 하는 상태에서 호출부가 추가로 `onSuccess`를 넘기는 것은 설계된 사용법이다(모달 닫기·폼 리셋). TanStack v5가 양쪽을 모두 실행하므로 무효화를 덮어쓰지 않는다.
