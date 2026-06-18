---
name: verify-fsd-boundaries
description: 프론트엔드 FSD 레이어 방향·슬라이스 Public API·세그먼트 컨벤션 위반을 정적으로 검사합니다. frontend/src 하위 파일을 추가·이동·import 변경한 후 사용.
---

# FSD 경계 검증

ADR [0009](../../../docs/05-adr/0009-frontend-fsd-architecture.md)는 FSD 경계를 **도구가 아닌 컨벤션으로만** 강제하기로 결정했고(대안 B: steiger/ESLint 경계 도입을 YAGNI로 기각), ADR [0012](../../../docs/05-adr/0012-frontend-types-constants-segments.md)가 세그먼트 컨벤션을 정련했다. 이 스킬이 그 컨벤션의 기계적 가드다.

`frontend/src/shared/auth/access.routes.test.ts`가 라우트-역할 3중 동기화를 빌드 타임에 강제하는 것과 달리, **레이어 경계·배럴·세그먼트는 어떤 테스트도 강제하지 않는다.**

## 목적

1. **레이어 방향** — 상위 레이어만 하위 레이어를 import (`app → views → widgets → features → entities → shared`)
2. **슬라이스 Public API** — 슬라이스 간 import는 `index.ts`만 경유 (deep-import 금지)
3. **배럴 존재** — `entities`/`features`/`widgets`/`views`의 모든 슬라이스는 `index.ts`를 가진다
4. **세그먼트 컨벤션** — entity 슬라이스는 `model/` 대신 `types/`, 모듈 수준 상수는 `constants/`
5. **얇은 라우팅** — `src/app/**/page.tsx`는 `views` 재노출만 (로직·JSX 금지)
6. **레거시 경로 소멸** — `@/lib`·`@/components` 잔존 0

## 실행 시점

- `frontend/src/` 하위에 파일을 추가하거나 슬라이스를 신설한 후
- 슬라이스 간 import를 추가·변경한 후
- 새 entity/feature/widget/view 슬라이스를 만든 후
- `src/app/` 라우트를 추가한 후
- Pull Request 생성 전

## Related Files

| File | Purpose |
|------|---------|
| `docs/05-adr/0009-frontend-fsd-architecture.md` | 레이어 구조·배럴·얇은 라우팅 결정의 단일 출처 |
| `docs/05-adr/0012-frontend-types-constants-segments.md` | `types`/`constants` 세그먼트 컨벤션, `lib/` 예외 |
| `docs/04-system-design.md` | §9 프론트엔드 아키텍처 (레이어 다이어그램) |
| `frontend/tsconfig.json` | `@/* → ./src/*` 단일 alias — 경계 grep이 이 접두사에 의존 |
| `frontend/src/shared/` | 최하위 레이어. 어떤 상위 레이어도 import 불가 |
| `frontend/src/entities/` | 12개 도메인 슬라이스 (`api`/`types`/`ui`/`lib`/`constants`) |
| `frontend/src/features/` | 사용자 행위 슬라이스 (`model`은 로직용으로 유지) |
| `frontend/src/widgets/` | `app-shell`, `notification-bell` |
| `frontend/src/views/` | 라우트 본문 (FSD `pages`를 `views`로 명명) |
| `frontend/src/app/` | Next 라우팅 + FSD app 레이어 (얇게 유지) |

## 워크플로우

모든 명령은 `frontend/` 디렉토리에서 실행한다.

### Step 1: 레이어 방향 위반

**검사:** 하위 레이어가 상위 레이어를 import하면 안 된다.

```bash
cd frontend
echo "shared -> upper:"   && grep -rnE "from '@/(entities|features|widgets|views)/" src/shared   --include='*.ts' --include='*.tsx'
echo "entities -> upper:" && grep -rnE "from '@/(features|widgets|views)/"          src/entities --include='*.ts' --include='*.tsx'
echo "features -> upper:" && grep -rnE "from '@/(widgets|views)/"                   src/features --include='*.ts' --include='*.tsx'
echo "widgets -> upper:"  && grep -rnE "from '@/views/"                             src/widgets  --include='*.ts' --include='*.tsx'
```

**PASS:** 네 명령 모두 출력 0줄.
**FAIL:** 출력된 각 줄이 위반. 수정 — 공유가 필요한 코드를 더 낮은 레이어(`shared` 또는 해당 `entities` 슬라이스)로 내리거나, 의존을 역전시켜 상위 레이어가 props/인자로 주입한다. 레이어를 올려서 해결하지 말 것.

### Step 2: 슬라이스 Public API (deep-import)

**검사:** 슬라이스 간 import는 슬라이스 루트(`index.ts`)만 경유한다.

```bash
cd frontend
grep -rnE "from '@/(entities|features|widgets|views)/[a-z0-9-]+/" src --include='*.ts' --include='*.tsx'
```

**PASS:** 출력 0줄 (`from '@/entities/booking'` 형태만 존재).
**FAIL:** 각 줄이 슬라이스 내부 세그먼트로의 deep-import. 수정 — 해당 슬라이스 `index.ts`에 심볼을 export하고 import를 슬라이스 루트로 바꾼다.

> **현재 알려진 위반 3건** (스킬 생성 시점, 미수정):
> - `src/features/complete-booking/model/booking-intent.ts:1` → `@/entities/test-result/lib/reports`
> - `src/entities/family-link/api/invalidation.ts:2` → `@/entities/test-result/api/keys`
> - `src/entities/family-link/api/invalidation.test.ts:3` → `@/entities/test-result/api/keys`
>
> 신규 위반과 구분하려면 이 3건을 기준선으로 삼는다. 3건을 초과하면 새 위반이 유입된 것.

### Step 3: 배럴 누락

**검사:** 모든 슬라이스는 `index.ts` Public API를 가진다.

```bash
cd frontend
for d in src/entities/* src/features/* src/widgets/* src/views/*; do
  if [ -d "$d" ] && [ ! -f "$d/index.ts" ]; then echo "MISSING: $d/index.ts"; fi
done
```

**PASS:** 출력 0줄.
**FAIL:** 배럴 없는 슬라이스는 외부에서 deep-import밖에 할 수 없다. 해당 슬라이스에 `index.ts`를 만들고 공개 심볼만 re-export한다.

### Step 4: 세그먼트 컨벤션 (ADR 0012)

**검사 4a — entity 슬라이스에 `model/` 잔존:** entity의 `model/`은 `types/`로 이전됐다.

```bash
cd frontend
find src/entities -maxdepth 2 -type d -name model
```

**PASS:** 출력 0줄.
**FAIL:** 해당 `model/`의 타입 선언을 같은 슬라이스 `types/index.ts`로 옮기고 배럴의 export 출처를 `./types`로 라우팅한다 (공개 이름은 불변).

> `src/features/*/model/`은 **정상**이다 — feature의 `model`은 순수 함수 로직(+단위 테스트)을 담는다. 이 검사는 `src/entities`만 대상으로 한다.

**검사 4b — `ui/` 내 인라인 타입 선언:** 컴포넌트 Props를 포함한 모든 `interface`/`type` 선언은 슬라이스 `types/`에 둔다.

패턴은 **컬럼 0에 앵커**한다 — 들여쓴 `  type Foo,`는 여러 줄 import 목록의 연속행이지 선언이 아니다. 대상은 `ui/*.tsx`(컴포넌트)로 한정한다.

```bash
cd frontend
grep -rnE '^(export )?(interface|type) [A-Z]' \
  src/entities/*/ui/*.tsx src/features/*/ui/*.tsx \
  src/widgets/*/ui/*.tsx src/views/*/ui/*.tsx 2>/dev/null
```

**PASS:** 출력 0줄.
**FAIL:** 선언을 슬라이스 `types/index.ts`로 옮기고 `ui/*.tsx`는 `../types`에서 import한다. `ui/`에는 JSX·로직만 남긴다.

> **현재 알려진 위반 11건** (스킬 생성 시점, 미수정) — `type Props` 인라인:
> `features/ask-test-result-ai/ui/QaPanel.tsx`(2), `features/view-booking-brief/ui/{BriefPanel,CallLogSection,GuidanceMarkdown}.tsx`,
> `views/availability/ui/{AvailabilityToolbar,AvailabilityDayGroup}.tsx`,
> `views/dashboard/ui/{BriefProductivityCard,QaDeflectionCard}.tsx`,
> `views/schedule/ui/{ScheduleDayGroup,ScheduleToolbar}.tsx`.
> ADR 0012는 entity 슬라이스 위주로 적용됐고 이후 추가된 feature/view 슬라이스가 드리프트했다. 11건을 기준선으로 삼고, 초과하면 새 위반이다.

**검사 4c — `ui/` 내 모듈 수준 상수:** 색/라벨 `Record` 맵, 정렬 배열, 센티넬 문자열 등은 `constants/`에 둔다.

```bash
cd frontend
grep -rnE '^const [A-Z][A-Z0-9_]+' \
  src/entities/*/ui/*.tsx src/features/*/ui/*.tsx \
  src/widgets/*/ui/*.tsx src/views/*/ui/*.tsx 2>/dev/null
```

**PASS:** 출력 0줄.
**FAIL:** 상수를 슬라이스 `constants/index.ts`로 옮긴다.

> **현재 알려진 위반 5건** (스킬 생성 시점, 미수정):
> `features/view-booking-brief/ui/CallLogSection.tsx`(`CALL_OUTCOMES`·`NOTE_MAX`·`OUTCOME_COLOR`),
> `views/availability/ui/AvailabilityPage.tsx`(`SCOPE_EMPTY_LABEL`),
> `views/schedule/ui/SchedulePage.tsx`(`SCOPE_EMPTY_LABEL`).

### Step 5: 얇은 라우팅

**검사:** `src/app/**/page.tsx`는 `views` 슬라이스 재노출 한 줄이다.

```bash
cd frontend
for f in $(find src/app -name 'page.tsx'); do
  lines=$(grep -cve '^\s*$' -e '^\s*//' -e '^\s*\*' -e '^\s*/\*' "$f")
  reexport=$(grep -c "export { default } from '@/views/" "$f")
  if [ "$reexport" -eq 0 ]; then echo "NOT A RE-EXPORT ($lines code lines): $f"; fi
done
```

**PASS:** 출력 0줄, 또는 `src/app/page.tsx`(루트 리다이렉트)만 출력.
**FAIL:** 페이지 본문을 `src/views/<route>/ui/<Name>Page.tsx`로 옮기고 `page.tsx`는 `export { default } from '@/views/<route>';`만 남긴다.

### Step 6: 레거시 경로

**검사:** ADR 0009 이행으로 제거된 타입별 구조(`lib/`·`components/`)로의 import는 0이어야 한다.

```bash
cd frontend
grep -rn "from '@/lib\|from '@/components\|_components" src --include='*.ts' --include='*.tsx'
```

**PASS:** 출력 0줄.
**FAIL:** `@/lib/format`·`@/lib/date`는 `@/shared/lib/format`·`@/shared/lib/date`로, `@/components/*`는 `@/shared/ui`로 경로를 갱신한다.

### Step 7: 회귀 게이트

경계 수정 후 반드시 실행한다.

```bash
cd frontend && pnpm typecheck && pnpm lint && pnpm test
```

**PASS:** typecheck 0 errors, lint 0, 전체 테스트 green.

## Output Format

```markdown
## FSD 경계 검증

| # | 검사 | 결과 | 위반 |
|---|------|------|------|
| 1 | 레이어 방향 | PASS / FAIL | (파일:줄) |
| 2 | 슬라이스 Public API | PASS / FAIL | N건 (기준선 3건 대비) |
| 3 | 배럴 존재 | PASS / FAIL | (슬라이스 경로) |
| 4a | entity `model/` 잔존 | PASS / FAIL | |
| 4b | `ui/` 인라인 타입 | PASS / FAIL | N건 (기준선 11건 대비) |
| 4c | `ui/` 인라인 상수 | PASS / FAIL | N건 (기준선 5건 대비) |
| 5 | 얇은 라우팅 | PASS / FAIL | |
| 6 | 레거시 경로 | PASS / FAIL | |
| 7 | typecheck / lint / test | PASS / FAIL | |

### 수정 제안
(위반별 구체적 수정안)
```

## 예외사항

다음은 **위반이 아닙니다**:

1. **슬라이스 내부 상대 경로 import** — 같은 슬라이스 안의 `./types`, `../constants`, `../api/keys` 등은 Public API 규칙 대상이 아니다. Step 2의 grep은 `@/` 절대 경로만 매칭하므로 애초에 걸리지 않는다.
2. **`src/app/page.tsx`의 로직** — 루트 페이지는 재노출이 아니라 `verifySession` 후 역할 홈으로 리다이렉트하는 서버 컴포넌트다(ADR 0010). Step 5에서 유일하게 허용되는 예외다. `layout.tsx`·`route.ts`·`middleware.ts`는 Step 5 대상이 아니다.
3. **`lib/` 유틸의 co-located 타입·상수** — ADR 0012가 명시한 예외. `entities/*/lib/*.ts`, `views/*/lib/*.ts`의 **내부 전용** 타입·상수는 유틸과 강결합이므로 분리하지 않는다. Step 4b·4c는 `ui/*.tsx`만 대상으로 하므로 `calendar-utils.ts` 같은 `ui/` 내 `.ts` 유틸도 자동 제외된다.
4. **`features/*/model/`** — feature의 `model`은 순수 함수 로직 세그먼트로 의도된 것이다(`booking-intent.ts`, `draft.ts`, `escalation.ts`). Step 4a는 `src/entities`만 검사한다.
5. **교차 entity 참조** — ADR 0009가 명시적으로 허용: 예약 UI가 검사 결과서를 참조하거나 analytics가 `Outcome`을 쓰는 등의 교차 참조는 각 entity의 Public API를 경유하면 정상이다(엄격 `@x` 표기 미도입). 단 **Public API 경유**여야 하므로 Step 2는 여전히 적용된다.
6. **`shared/config`의 교차 원시 union** — `Role`·`Outcome`·`BookingStatus` 같은 도메인 union이 `shared`에 있는 것은 ADR 0009의 결정이다. `shared`가 도메인을 안다는 이유로 위반 처리하지 않는다.
7. **테스트 파일의 deep-import** — `*.test.ts`가 내부 모듈을 직접 검증하는 것은 단위 테스트의 정상 범위다. 단, 프로덕션 코드와 함께 기준선(Step 2)에 집계해 새 위반과 구분한다.
