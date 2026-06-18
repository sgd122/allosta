# ADR 0012 — 프론트엔드 `types`/`constants` 세그먼트 분리

- **상태**: Accepted
- **날짜**: 2026-06-10
- **관련**: [0009 frontend-fsd-architecture](./0009-frontend-fsd-architecture.md)(본 ADR이 세그먼트 컨벤션을 정련), [04-system-design §9.2.1](../04-system-design.md#921-fsd-레이어-구조-adr-0009)

**결정 (한 줄):** 각 슬라이스에 `types/`(모든 타입·인터페이스)와 `constants/`(모듈 수준 상수) 세그먼트를 신설해 타입의 단일 출처를 확보하고, `model/` 세그먼트는 타입 전용 슬라이스에서 제거한다.

## 맥락

ADR 0009로 FSD 레이어 구조를 도입한 뒤, 각 슬라이스의 **타입 선언과 상수**가 두 곳에 흩어져 있었다.

1. **타입 위치 혼재**: entity 슬라이스의 `model/`은 사실상 도메인 **타입만** 담고 있었다(스토어·로직 없음). 동시에 컴포넌트 Props·로컬 인터페이스는 `ui/*.tsx` 본문에 인라인으로 선언돼 있었다. "이 슬라이스의 타입이 무엇인가"를 한곳에서 볼 수 없었다.
2. **상수 인라인**: 색/라벨 `Record` 맵, 정렬 배열, 센티넬 문자열 등 모듈 수준 상수가 `ui/*.tsx` 본문에 섞여 컴포넌트 로직과 응집도가 낮았다.

## 결정

각 슬라이스에 **`types/`(모든 타입·인터페이스 선언)**, **`constants/`(모듈 수준 상수)** 세그먼트를 도입한다.

- **`model/` → `types/` (타입 전용 슬라이스)**: entity 슬라이스의 `model/`은 타입만 담고 있었으므로 `types/index.ts`로 이전하고 `model/` 세그먼트를 제거한다. 타입의 단일 출처를 `types/`로 일원화.
- **로직이 있는 `model/`은 유지**: feature 슬라이스(`complete-booking`·`create-consultation-record`)의 `model/`은 순수 함수 로직(+단위 테스트)을 담으므로 그대로 둔다. 단, 그 안의 **타입 선언만** `types/`로 추출한다(로직 파일은 `../types`에서 재import).
- **`ui/` 인라인 인터페이스 분리**: 컴포넌트 Props를 포함한 모든 `interface`/`type` 선언을 슬라이스 `types/`로 옮긴다. `ui/*.tsx`에는 JSX·로직만 남는다.
- **`ui/` 인라인 상수 분리**: 색/라벨 맵 등 UI 표현용을 포함한 모듈 수준 상수를 슬라이스 `constants/`로 옮긴다.
- **`lib/` 예외**: 유틸리티 모듈(`lib/*.ts`, `booking/ui/calendar-utils.ts` 등)의 **내부 전용** 타입·상수는 해당 유틸과 강결합이므로 co-locate를 유지한다(분리하지 않음).
- **Public API 불변**: 배럴 `index.ts`의 공개 export 이름은 동일하게 유지하되 출처만 `./types`·`./constants`로 라우팅한다. 슬라이스 외부 소비자는 영향 없음(외부는 `model/`을 deep-import 하지 않았음).

## 대안

| 안 | 내용 | 기각 사유 |
|---|---|---|
| **A. Props는 컴포넌트와 co-locate 유지** | 도메인/공유 타입만 `types/`로, 컴포넌트 Props는 `ui/*.tsx`에 잔존(React 관용) | "`ui`에 인터페이스 코드를 두지 않는다"는 본 변경의 목표와 상충. 타입 위치 일원화 우선. |
| **B. `config/` 세그먼트(FSD 표준)에 상수** | FSD 정식 세그먼트명 `config` 사용 | 본 프로젝트는 의도를 드러내는 `constants` 네이밍을 채택(세그먼트는 내용 기준 명명). |
| **C. `model/` 유지 + `types/` 신설 공존** | 도메인 타입은 `model/`, 추출분만 `types/` | 타입 출처가 둘로 갈라져 혼재 문제가 재발. |

## 결과

- **검증**: `pnpm typecheck`(0 errors) · `pnpm lint`(0) · `pnpm test`(49 passed) · `pnpm build`(15 라우트) green.
- **구조**: entity 12개 슬라이스에서 `model/` 제거 → `types/`. `analytics`·`test-result`·`booking` 등 `ui` 인라인 타입/상수가 `types/`·`constants/`로 이동. feature 슬라이스는 `model/`(로직) 유지 + 타입만 추출.
- **트레이드오프**: 세그먼트 수가 늘어 슬라이스당 파일이 증가한다. 컴포넌트 Props가 컴포넌트 파일 밖(`types/`)에 위치해 React 관용(Props co-location)과 어긋나지만, "슬라이스 타입의 단일 출처" 이점을 우선했다.
