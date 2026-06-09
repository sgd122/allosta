# ADR 0008 — 방문 단위 "검사 결과서"로의 결과 그룹핑 (표시 전용)

- **상태**: Accepted
- **날짜**: 2026-06-10
- **관련**: [0003 polymorphic-subject](./0003-polymorphic-subject.md), [0007 challenge-enrollment](./0007-challenge-enrollment.md), [FR8](../02-requirements.md), [03-mvp-scope §1 #4](../03-mvp-scope.md)

## 맥락

`TestResult`는 serviceType(대사 6종·음식물 과민·장내 미생물 …) **1종당 1 row**로 저장된다(ADR 0003: seed-only/read-only, 스키마 동결). 그러나 고객은 한 번의 방문에서 받은 여러 검사를 **하나의 검사 결과서**로 인식한다. 초기 UI는 이를 그대로 노출해 두 가지 혼선을 만들었다:

1. **검사결과 화면**: 본인 결과와 연동(가족) 계정 결과가 한 피드에 섞여 "누구 것"인지 헷갈림.
2. **검사 단위 노출**: 개별 serviceType이 각각 별도 카드로 떠서 "한 세트의 검사"라는 인식과 어긋남. `내 예약`에는 raw 코드(`METABOLIC_6`)가 그대로 노출.

## 결정

`TestResult`를 **(subjectId + 검사일) 기준으로 묶은 방문 단위 "검사 결과서"(`TestReport`)**로 **표시 레벨에서만** 그룹핑한다. **스키마·API·DTO 변경 없음.**

- **그룹핑 헬퍼**: `frontend/lib/reports.ts`의 순수 함수 `groupResultsIntoReports(results, nameBySubjectId)` — 입력 불변, 단위 테스트(`reports.test.ts`)로 커버.
- **검사결과 화면**(`/results`): Radix `Tabs`로 **`내 검사` / `연동 계정`** 서브탭 분리. 각 탭은 검사 결과서 카드를 렌더하고, 카드 내부에 serviceType별 섹션(친화 라벨 + 지표 테이블)을 둔다.
- **예약하기**(`BookingModal`): 개별 검사 대신 **검사 결과서 단위**로 선택. 선택 시 `representativeResultId`(최신 결과 id)를 `Booking.testResultId`로 전송.
- **내 예약**(`/bookings`): 예약의 단일 `testResultId`를 `indexReportsByResultId`로 결과서에 역매핑해, 단일 검사명이 아니라 **결과서 전체 검사 목록 + 소유자 배지**를 표시(캡션 "검사 결과서"). 미매핑 시 `formatServiceType(serviceType)`로 폴백.
- **상담사 기록 폼**(`ConsultationRecordForm`): 검사 지표 선택 영역을 고객과 **동일한 레이아웃**(공용 `components/ResultSection` — 친화 라벨 + 항목/수치/참조범위/판정 배지)으로 렌더하고, 선택용 체크박스 컬럼만 추가해 `metricRefs` 연계를 유지. 고객 결과 페이지와 단일 컴포넌트를 공유한다.

### 백엔드 무변경이 안전한 이유

`Booking.testResultId`는 subject를 파생하는 **앵커**일 뿐이다(ADR 0003). 상담 기록 폼은 이미 `getBookingSubjectTestResults`에서 **해당 subject의 전체 TestResult**(`WHERE subjectType, subjectId`)를 로드하므로, 결과서 내 어느 결과를 앵커로 보내도 상담사는 동일한 전체 결과서를 본다. 따라서 "결과서 단위 선택"은 서버 의미상 이미 성립하며, 대표 id 전송만으로 충분하다.

## 대안

| 안 | 내용 | 기각 사유 |
|---|---|---|
| **B. 고정 패키지 카탈로그** | 여러 serviceType을 묶는 명명 패키지를 엔티티로 정의, 예약/결과를 패키지 단위로 | Prisma 스키마·시드·API 변경 동반. ADR 0003(동결)과 충돌하고 2주 예산 대비 과투자. |
| **C. 라벨만 친화화** | 그룹핑 없이 라벨만 교체 | 혼선의 근본(본인/가족 혼재, 검사 산재)을 해소 못 함. |

## 결과

- 검사결과 혼선 해소(탭 분리) + 검사가 방문 단위 결과서로 일관 표현.
- 백엔드 테스트 영향 0(표시 전용). 신규 순수 헬퍼는 `reports.test.ts`로 커버.
- 트레이드오프: 결과서 경계가 **검사일(달력 일)** 기준이라, 동일인의 동일 일자 결과는 항상 한 결과서로 묶인다(시드 데이터와 일치). 향후 실제 업로드(`UploadPipeline`) 도입 시 "방문 id"가 생기면 그 기준으로 승격 가능.
