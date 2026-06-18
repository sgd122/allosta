---
name: verify-design-tokens
description: Tailwind×Radix 토큰 레이어링 규약(preflight OFF에 따른 border 짝짓기, 템플릿 문자열 클래스 금지, 정적 톤 맵 경유)을 검사합니다. 프론트엔드 컴포넌트 스타일이나 tailwind.config.ts를 수정한 후 사용.
---

# 디자인 토큰 규약 검증

[ADR 0011 §1](../../../docs/05-adr/0011-frontend-styling-state-api-hooks.md)은 Tailwind를 Radix Themes **위에 레이어링**하기로 결정했다. Radix가 컴포넌트 프리미티브와 런타임 테마(색·반경 CSS 변수)를 소유하고, Tailwind는 레이아웃·간격·타이포를 소유한다.

이 결정은 **두 개의 조용한 실패 모드**를 만든다.

1. **`preflight: false`** — Radix가 자체 reset을 제공하므로 Tailwind base reset을 껐다. 그 결과 **맨 `border` 유틸에는 기본 색이 없다.** 타입체크도 린트도 통과하지만 화면에서 테두리가 보이지 않는다.
2. **Tailwind purge** — 클래스는 정적 분석 가능해야 한다. `text-${tone}-11` 같은 템플릿 문자열은 **빌드에서 제거되어 색이 사라진다.** 개발 서버에서는 보일 수 있어 더 위험하다.

둘 다 컴파일도 테스트도 잡지 않는다. 이 스킬이 그 가드다.

## 목적

1. **템플릿 문자열 클래스 금지** — 동적 클래스는 purge되므로 정적 톤 맵을 경유한다
2. **`border` 짝짓기** — 맨 `border` 유틸은 항상 색과 함께 쓴다
3. **토큰 단일 출처** — `tailwind.config.ts`가 Radix CSS 변수에 매핑하고 값을 중복하지 않는다
4. **preflight 설정 보존** — `preflight: false`가 유지된다
5. **`globals.css` 경계** — 진성 CSS만 남고 컴포넌트 인라인 토큰 스타일은 없다

## 실행 시점

- `frontend/src/**/ui/*.tsx`의 `className`을 수정한 후
- `frontend/tailwind.config.ts`를 수정한 후
- `frontend/src/shared/ui/`에 프리미티브를 추가한 후
- 런타임 톤(상태별 색)을 다루는 컴포넌트를 추가한 후
- Pull Request 생성 전

## Related Files

| File | Purpose |
|------|---------|
| `docs/05-adr/0011-frontend-styling-state-api-hooks.md` | §1 Tailwind on Radix 레이어링 결정 |
| `frontend/tailwind.config.ts` | `preflight: false` + Radix CSS 변수 매핑 (색 6스케일·반경 1–4·폰트 3종) |
| `frontend/src/shared/ui/tone.ts` | 정적 톤 클래스 맵 (`toneText` step 11, `toneFill` step 9) |
| `frontend/src/shared/ui/index.ts` | 프리미티브 배럴 |
| `frontend/src/shared/ui/Eyebrow.tsx` | mono/대문자/teal 라벨 프리미티브 |
| `frontend/src/shared/ui/StatNumber.tsx` | serif KPI 숫자 프리미티브 |
| `frontend/src/shared/ui/Meter.tsx` | 진행 바 프리미티브 |
| `frontend/src/shared/ui/PageHeader.tsx` | 페이지 헤더 프리미티브 |
| `frontend/src/shared/ui/RecordField.tsx` | 기록 필드 프리미티브 |
| `frontend/src/app/globals.css` | 진성 CSS (keyframes·로그인 그라디언트) |

## 워크플로우

모든 명령은 `frontend/` 디렉토리에서 실행한다.

### Step 1: 템플릿 문자열 클래스

**검사:** Tailwind는 소스를 정적 스캔하므로 런타임에 조립된 클래스명은 빌드 산출물에 존재하지 않는다.

주석 줄은 제외한다 — `tone.ts`가 이 금지 규칙을 **설명하는 주석**에서 금지 패턴을 그대로 인용하기 때문이다.

```bash
cd frontend
grep -rnE '(text|bg|border|fill|ring|from|to)-\$\{' src --include='*.ts' --include='*.tsx' \
  | grep -vE ':\s*\*|:\s*//'
```

**PASS:** 출력 0줄.

**FAIL:** 각 줄이 purge되어 색이 사라질 클래스다. `shared/ui/tone.ts`의 `toneText`/`toneFill` 같은 **정적 `Record` 맵**으로 바꾼다 — 런타임 톤 이름을 실제 컴파일된 유틸 클래스로 변환하는 방식이다. 새 스케일이 필요하면 `tone.ts`에 맵을 추가하지, 템플릿을 쓰지 않는다.

### Step 2: `border` 짝짓기

**검사:** `preflight: false`이므로 맨 `border`(너비만)는 색이 없어 보이지 않는다.

```bash
cd frontend
grep -rnoE '\b(border|border-[024８]|border-solid)\b[^"'"'"'`]*' src --include='*.tsx' \
  | grep -vE 'border-(gray|teal|amber|red|blue|violet|current|transparent|inherit)' \
  | head -30
echo "--- 총 건수 ---"
grep -rnoE '\bborder\b' src --include='*.tsx' | wc -l
```

**PASS:** 출력된 각 줄에서 같은 `className` 문자열 안에 색 유틸(`border-gray-5` 등)이 함께 있음이 확인된다. grep은 줄 단위라 자동 판정이 불가능하므로 **출력된 줄을 직접 읽고 판단한다.**

**FAIL:** 색 없이 `border`나 `border-solid`만 있는 곳. `border border-gray-5` 형태로 색을 붙인다. 조건부 클래스라면 **모든 분기**에 색이 있는지 본다 — 한 분기만 빠지면 그 상태에서만 테두리가 사라진다.

> `border-b`·`border-t` 같은 방향 유틸도 같은 함정을 가진다. 방향만 지정하고 색을 빼면 마찬가지로 보이지 않는다.

### Step 3: 토큰 단일 출처

**검사:** `tailwind.config.ts`는 값을 복제하지 않고 Radix 런타임 CSS 변수를 가리켜야 한다. 그래야 Radix가 팔레트를 스왑할 때(예: 다크모드) Tailwind 클래스도 자동으로 따라간다.

```bash
cd frontend
echo "--- 하드코딩된 색값 (있으면 위반) ---"
grep -nE "#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(|oklch\(" tailwind.config.ts
echo "--- var() 매핑 ---"
grep -cE 'var\(--' tailwind.config.ts
echo "--- 매핑된 색 스케일 ---"
grep -nE '^\s+(teal|gray|amber|red|blue|violet):' tailwind.config.ts
```

**PASS:** 하드코딩 색값 0줄. `var(--...)` 참조가 다수. 색 6스케일(`teal` `gray` `amber` `red` `blue` `violet`)이 `radixScale()`로 매핑되고, 반경 `rounded-1..4`가 `var(--radius-N)`을, 폰트 3종이 `var(--font-*)`을 가리킨다.

**FAIL:** 리터럴 색값이 들어오면 Radix 테마 스왑과 어긋나 두 팔레트가 공존하게 된다. `var(--<scale>-<step>)` 참조로 바꾼다. 차트용 시맨틱 색(`purchased`·`onhold`·`rejected`)은 `globals.css`의 `--c-*` 변수를 가리키며, **두 파일이 함께 바뀌어야 한다.**

### Step 4: preflight 설정 보존

**검사:** `preflight: false`가 유지된다. 되켜면 Radix reset과 충돌해 전역 레이아웃이 깨진다.

```bash
cd frontend
grep -n -A3 'corePlugins' tailwind.config.ts
```

**PASS:** `corePlugins: { preflight: false }`.

**FAIL:** `true`로 바뀌었거나 `corePlugins` 블록이 사라졌다면(기본값 true) 되돌린다. Radix Themes가 자체 reset을 제공하므로 두 reset이 싸운다.

> 이 값을 바꾸는 것은 ADR 0011 §1을 뒤집는 결정이다. 코드만 고치지 말고 ADR을 갱신하거나 새 ADR을 남긴다.

### Step 5: `globals.css` 경계

**검사:** ADR 0011은 `globals.css`에 **진성 CSS만** 남기기로 했다 — Tailwind 유틸로 표현할 수 없는 것들이다. 반복되는 토큰 조합은 `shared/ui` 프리미티브로 1회 정의한다.

```bash
cd frontend
echo "--- 규모 ---"; wc -l src/app/globals.css
echo "--- 선택자 수 ---"; grep -cE '^[.#@a-zA-Z\[:][^{]*\{' src/app/globals.css
echo "--- 선택자 목록 ---"; grep -nE '^[.#@a-zA-Z\[:][^{]*\{' src/app/globals.css
```

**PASS:** 선택자가 아래 정당한 범주에 속한다. 기준선(스킬 생성 시점) **446줄 / 62 선택자**:

| 범주 | 예 | 정당한 이유 |
|---|---|---|
| CSS 변수·엘리먼트 기본 | `:root` `html` `body` `h3` `a` `::selection` | Radix 토큰 정의와 타이포 기본값 |
| 모션 | `.rise` `@keyframes rise` `@media (prefers-reduced-motion)` | keyframes는 유틸로 표현 불가 |
| 앱 크롬 | `.app-shell` `.topbar` `.counselor-nav*` `.brand-mark` | 전역 레이아웃 셸 |
| 로그인 장식 | `.login-screen` `.login-orbit` `.orbit-ring*` `.orbit-core` | 그라디언트·오빗 — 유틸로 표현 불가 |
| 차트 기하 | `.donut*` `.metric-bar-*` | SVG/도넛 지오메트리 — 유틸 범위 밖 |
| Radix 오버라이드 | `.rt-BaseCard.rt-variant-surface::after` | 라이브러리 내부 클래스 타겟팅 |

**FAIL:** 위 범주 어디에도 안 들어가는 **도메인 컴포넌트 클래스**가 늘어나는 것이 신호다 — `.booking-card` `.schedule-row` 처럼 특정 화면의 컴포넌트를 겨냥한 것. 그런 스타일은 유틸 클래스로 쓰거나, 반복되면 `shared/ui` 프리미티브로 올린다(`Eyebrow`·`StatNumber`·`Meter`·`PageHeader`·`RecordField`가 그 선례다).

선택자 수가 62를 유의미하게 넘어가면 **무엇이 추가됐는지** 확인한다. 절대 수치가 아니라 **증가분의 성격**이 판정 기준이다.

### Step 6: 빌드 게이트

**검사:** purge는 프로덕션 빌드에서만 일어난다. `dev`에서 보이던 색이 `build`에서 사라지는 것을 잡으려면 빌드를 돌려야 한다.

```bash
cd frontend && pnpm lint && pnpm build
```

**PASS:** 빌드 성공. 출력을 그대로 보고한다.

> 빌드 성공이 "색이 살아 있다"를 증명하지는 않는다 — purge는 조용하다. Step 1이 그 정적 가드이며, 시각적 확인이 필요하면 `pnpm test:e2e`의 스크린샷을 쓴다.

## Output Format

```markdown
## 디자인 토큰 규약 검증

| # | 검사 | 결과 | 위반 |
|---|------|------|------|
| 1 | 템플릿 문자열 클래스 | PASS / FAIL | (파일:줄) |
| 2 | `border` 짝짓기 | PASS / FAIL | (파일:줄) |
| 3 | 토큰 단일 출처 | PASS / FAIL | (하드코딩 값) |
| 4 | preflight 보존 | PASS / FAIL | |
| 5 | `globals.css` 경계 | PASS / FAIL | (선택자) |
| 6 | lint / build | PASS / FAIL | |

### 수정 제안
(위반별 구체적 수정안)
```

## 예외사항

다음은 **위반이 아닙니다**:

1. **`tone.ts` 주석 안의 `text-${color}-11`** — 그 파일이 바로 이 금지 규칙을 구현하는 곳이고, 주석은 왜 금지인지를 설명하기 위해 패턴을 인용한다. Step 1의 grep이 주석 줄을 걸러내지만, 다른 형태로 잡히더라도 위반으로 보고하지 마라.
2. **`border-solid`만 단독으로 쓰인 경우 중 색이 조건부 클래스에 있는 것** — `ToggleChip.tsx`·`OutcomeSelector.tsx`·`BookingCalendar.tsx`처럼 기본 클래스에 `border border-solid`를 두고 색은 선택 상태에 따라 뒤 템플릿에서 붙이는 패턴이 있다. **모든 분기에 색이 있으면 정상**이다. 줄 단위 grep으로는 판정할 수 없으니 반드시 파일을 열어 확인한다.
3. **`shared/ui` 프리미티브 내부의 하드코딩 유틸** — `Eyebrow`가 `text-teal-11`을 고정으로 갖는 것은 그 프리미티브의 정체성이다. 톤이 런타임에 바뀌지 않는 곳에서는 정적 클래스가 정답이며 톤 맵을 경유할 필요가 없다.
4. **`globals.css`의 `--c-purchased` 등 시맨틱 변수** — `tailwind.config.ts`가 이 변수를 가리키므로 CSS에 정의가 있는 것이 정상이다. Step 3의 "하드코딩" 검사는 `tailwind.config.ts`만 대상으로 하며 `globals.css`의 변수 정의는 단일 출처 그 자체다.
5. **임의 값 유틸(`px-[14px]`·`min-w-[120px]`)** — Radix 토큰에 없는 일회성 레이아웃 수치는 Tailwind 임의 값으로 두는 것이 ADR 0011의 역할 분담(Tailwind = 레이아웃·간격)에 맞다. 색에만 토큰 규약이 걸린다.
