# MVP 범위 및 구현 깊이 (MVP Scope & Differentiated Depth)

> **문서 목적**: 5개 컴포넌트의 구현 깊이를 차등화한 근거를 명시한다.
> 깊이의 차등 자체가 "2주 솔로 평가과제에서 무엇을 증명하는가"를 결정하는 설계 판단이다.

---

## 1. 컴포넌트별 구현 깊이 표

| # | 컴포넌트 | 구현 깊이 | 구체적 내용 | 깊이 선택 근거 |
|---|---------|----------|------------|--------------|
| 1 | **Booking (상담 예약)** | **REAL** | 통합 캘린더 조회(`availableCount` — 만석 시 다른 일자·상담사 슬롯 노출), TestResult 기반 예약 생성(PENDING-first), 상담사 확정(PENDING→CONFIRMED), 취소(취소 슬롯 즉시 재노출), 동시성 보장(partial unique index + insert-first), 고객 시간대 중복 예약 차단(GiST EXCLUDE 제약 — 다른 상담사라도 겹치는 시간이면 409; ADR 0015), RBAC + 소유권 검증, 상담사 콘솔 일정 가시성·관리(`NO_SHOW` 포함 표시 + 기간·예약상태 2축 필터 + 날짜별 그룹핑, 가용 슬롯 날짜별 그룹 관리; ADR 0013) | 본 서비스의 존재 이유. 동시성 정확성이 핵심 설계 판단이고, 통합 테스트로 AC2(20 동시→1 성공·19×409)를 증명해야 한다. PENDING-first 모델은 실제 상담 운영에서 상담사가 예약을 검토·확정하는 절차를 반영한다. **셀프서비스 가용 캘린더**가 R4(만석 이탈 근본원인)의 1차 해법이다 — 만석 시 고객이 다른 일자·상담사 슬롯을 직접 예약하면 원래의 "전화 술래잡기 → 조용한 이탈" 마찰이 제거된다. 고객 대기열(waitlist/queue)은 reasoned Phase 2 Non-Goal(§2.8). |
| 2 | **Consultation Log / CRM (상담 기록 + 챌린지 등록 + CallLog)** | **REAL** | 구조화 기록 입력(summary/recommendation/followUp 구조화 3슬롯 + interestedProducts + outcome{EXPLAINED,GUIDED,PURCHASED} + actions 체크리스트), 지표 연결(ConsultationRecordMetric), **관리 프로그램(챌린지) 등록(`ChallengeEnrollment`, 상담 기록 생성 트랜잭션 내 원자적 등록 — BioCom step-3)**, **CallLog** 비파괴적 증거 레이어(브리핑 `phone` 투영 + `POST /counselor/bookings/:bookingId/calls` 통화 시도 기록 + `noShowWithoutContactRate` 집계 — R6 CallLog=MVP additive), 본인 담당 예약만 기록 가능(소유권 검증) | 기록 스키마 부재가 R2(전환율 수동집계)의 근본원인이다. 자유 텍스트 단일 `notes`는 상담사마다 기록 깊이·형태가 달라 *내용* 일관성을 강제하지 못한다 — 고정 슬롯(summary/recommendation/followUp) + enum `actions` 체크리스트로 모두 동일한 형태로 기록하게 만든다. 이는 `outcome` enum이 결과를 일관되게 만드는 것과 동일한 메커니즘이다. 덤으로 `actions × outcome`이 쿼리 가능해져 어떤 상담행위가 전환에 기여했는지 세그먼트 분석(R5)을 할 수 있다. "검사 기반" 서비스에서 *어떤 지표를 논의했는가*를 잡지 못하면 Analytics와의 연결고리(R5)가 끊긴다. 또한 BioCom 3-step의 step-3(관리 프로그램 등록, R9)을 같은 트랜잭션에서 캡처해 "상담이 관리 프로그램 등록으로 이어졌는가"를 데이터로 만든다(설계 근거는 ADR 0007). 구조화 입력 + 지표 귀속 + 챌린지 등록이 일반 상담 CRM과의 차별점이므로 REAL로 가야 한다. |
| 3 | **Analytics (전환 분석)** | **REAL** | 전환율·outcome 분포·상품별 관심 집계, 지표별 전환율 집계(`GET /admin/analytics`), **챌린지 등록 수(`challengeEnrollments`)·등록 전환율(`challengeConversionRate`, 구매→등록, `number\|null`)**, scope 토글(own/all), 실시간 쿼리(별도 집계 테이블 없음) | Analytics가 SIMULATED이면 "자동 집계 대시보드" 요구사항 전체가 미증명이 된다. Booking·CRM이 REAL이므로 집계 쿼리를 실제로 실행할 데이터가 존재하며, seed 기록으로 기대값 일치를 assert할 수 있다. 챌린지 등록 전환율은 BioCom step-3의 가치를 측정하는 지표로, record JOIN을 통해 상담사별 범위 토글을 그대로 준수한다(0=구매했으나 미등록, null=구매 기록 없음을 구분). 별도 OLAP 없이 PostgreSQL 집계 쿼리만으로 MVP 집계를 충족할 수 있다(확장 설계는 Phase 2). |
| 4 | **Test Results (검사 결과)** | **SEED + READ-ONLY** | seed.ts에 BioCom 7종 검사(대사 6종·음식물 과민·스트레스/노화·영양/중금속·장내 미생물·호르몬·펫 영양) 삽입 — 각 지표에 `referenceRange` + `status(정상/주의/위험)` 포함, `GET /test-results`(본인 + ACCEPTED `FamilyLink` 파트너 검사결과 포함), 업로드 파이프라인은 `UploadPipeline` 인터페이스로 경계 설계 | 검사 결과 업로드·파싱은 외부 시스템(결과지 포맷, OCR, HL7 등) 의존도가 높아 2주 솔로 예산에서 구현하면 핵심 설계(예약·집계)에 쓸 시간을 잠식한다. 반면 "검사 결과가 존재한다"는 전제는 Booking의 TestResult 기반 subject 파생과 Analytics의 지표 연결에 필수다. seed로 전제를 충족하고(참조범위·상태는 결과 해석 UX를 위해 시드에 사전 계산), 인터페이스(`UploadPipeline`)로 확장 경로를 설계 경계로 명시한다. `serviceType`은 자유 문자열을 유지하되 공유 `SERVICE_TYPES` 상수로 표류를 막는다(ADR 0007). 검사결과 화면은 본인/가족 혼선을 없애기 위해 **`내 검사`/`연동 계정` 서브탭**으로 나누고, 개별 결과를 **방문 단위 "검사 결과서"**로 묶어 표시한다(표시 전용, 스키마 무변경 — ADR 0008). |
| 5 | **Notifications (알림)** | **SIMULATED** | `NotificationChannel` 인터페이스 + `ConsoleChannel`/`InAppChannel`(실동작) + `EmailChannel`/`SmsChannel`(어댑터 stub), `@nestjs/schedule` 스케줄러로 REMINDER 잡 실행, Notification 레코드 상태 추적(PENDING→SENT) | 실제 SMS/카카오 발송은 외부 계정·API 키를 요구해 재현성(외부 계정 0개) 동인을 즉각 위반한다. 동시에 "알림을 설계하지 않은 것"처럼 보이면 설계 의도가 전달되지 않는다. 어댑터 인터페이스로 실제 채널 교체 경로를 설계하고, Console/InAppChannel로 스케줄러 발화·상태 전이를 실제 동작으로 보여줌으로써 "구현 가능하지만 의도적으로 시뮬레이션으로 경계를 그은 것"임을 증명한다. |
| 6 | **Family Linking (가족 연결)** | **REAL (단순형)** | 대칭형 `FamilyLink`(Customer↔Customer) 초대 코드 생성/수락/철회(PENDING→ACCEPTED→REVOKED), `GET /test-results`에서 ACCEPTED 가족 포함 | 가족 검사결과 대리 상담(R3)의 핵심 인프라다. 예약 subject는 항상 `CUSTOMER`이고, 본인 또는 `ACCEPTED` 가족 파트너가 소유한 TestResult를 예약하려면 "두 고객이 인증된 가족 관계인가"를 시스템이 검증할 수 있어야 한다. 대칭형 `FamilyLink`는 그 인증된 연결 관계를 표현한다. 위임 권한의 복잡한 OAuth 플로우는 Phase 2로 분리하고, 초대 코드 기반 단순형으로 핵심 가치를 증명한다. |
| 7 | **상담 준비·생산성 자동화** | **REAL** | 상담사 사전 브리핑(`GET /counselor/bookings/:bookingId/brief` — 결정론 조립, 브리핑 열람 시 `briefOpenedAt` 1회 기록), 고객 선택 `concern`(예약 시 선택 입력, 브리핑 write-only), **상담 전 AI 가이던스**(`ConsultationBriefGuidance` bookingId-keyed FALLBACK/UPGRADED 생명주기 — 다가오는 상담 진행 안내), `briefOpenRate` Analytics. Ollama 업그레이드는 **옵트인** — 미설치 환경에서는 항상 결정론 FALLBACK | 상담사 상담 준비 시간을 줄이고 상담 품질을 높이는 생산성 기능이다. AI는 다가오는 상담을 **어떻게 진행할지** 대상자의 검사 지표·과거 기록(+`concern`)에서 파생해 미리 안내한다(사후 요약이 아님 — 예약 단위 사전 가이던스). 그러나 LLM은 재현성 동인(NFR1: 외부 계정·API 키 0개, Ollama 없이도 golden path 통과)을 위협해서는 안 된다. 예약 단위 `ConsultationBriefGuidance` 엔티티 + 브리핑 열람 시 결정론 FALLBACK 보장 + OpsScheduler `@Interval` 스윕(FALLBACK→UPGRADED 자동, 수동 트리거 없음)으로 golden path가 Ollama와 무관하게 동작함을 보장한다(ADR 0014). LLM 출력은 비결정적이므로 테스트는 어댑터 경계(payload/timeout/실패→폴백 회귀)만 단정하고, 텍스트 내용은 단정하지 않는다. |

---

## 2. Non-Goal 목록 및 제외 근거

각 Non-goal은 "안 했다"가 아니라 "근거 있게 미뤘거나 인터페이스로 경계를 설계했다"로 서술한다.

### 2.1 실제 결제/커머스 연동

**제외 근거**: 전환(구매)은 상담사가 상담 직후 outcome 필드(`EXPLAINED | GUIDED | PURCHASED`)에 수동 입력하는 방식으로 대체한다. 수동 집계 자체가 R2(기록 스키마 부재)가 만든 페인이었으므로, 구조화 입력 + 자동 집계가 결제 연동 없이도 전환 가치를 증명한다. 실 결제 시스템은 외부 PG 계약·웹훅·환불 처리 등 독립적인 설계 난제를 수반하며, 2주 평가과제의 범위를 벗어난다.

### 2.2 실제 SMS/카카오 알림 발송

**제외 근거**: 재현성 동인(외부 계정 0개)의 직접 충돌 항목이다. 실제 SMS/카카오 연동은 계정·API 키·수신 번호를 요구해 평가자가 그대로 실행하는 것이 불가능하다. `NotificationChannel` 인터페이스를 정의하고 `ConsoleChannel`/`InAppChannel`로 실동작, `EmailChannel`/`SmsChannel`은 어댑터 stub(주석으로 실 구현 경로 명시)으로 제공함으로써 "확장 가능한 설계"임을 코드 수준에서 드러낸다. 실 발송 어댑터 구현은 Phase 2.

### 2.3 검사결과 업로드/파싱 파이프라인

**제외 근거**: 검사 결과 업로드는 결과지 포맷(PDF, HL7, CSV 등) 파싱, 파일 저장소, 비동기 처리 파이프라인을 포함하는 독립적인 서브시스템이다. MVP에서 TestResult를 seed JSON으로 제공함으로써 Booking·Analytics와의 연결(TestResult 기반 subject 파생, 지표 귀속)은 완전히 동작한다. `UploadPipeline` 인터페이스를 `test-result/upload-pipeline.interface.ts`에 정의하고 설계 주석으로 확장 경로를 명시하는 방식으로 경계를 설계한다. 실 구현은 Phase 2.

### 2.4 가족 구성원 위임 권한 모델 (OAuth/복잡한 동의 관리)

**제외 근거**: 가족 연결의 핵심 가치는 보호자가 가족의 검사 결과를 상담 대상으로 지정할 수 있다는 것이다. 이는 `FamilyLink` 초대 코드 기반 연결로 충분히 증명된다. 가족 구성원에게 복잡한 위임 권한 모델을 설계하는 것은 OAuth 위임, 접근 동의 관리, 별도 인증 플로우를 요구하는 독립 과제다. Phase 2에서 확장 경로를 설계한다.

### 2.5 결과지 PDF 생성, 결제 수단 관리, 정산

**제외 근거**: PDF 생성은 결과지 렌더링·서명·보관 등 별도 서브시스템이고, 정산은 결제 연동(2.1 참조)이 선행된다. MVP의 가치 증명(예약→확정→상담기록→전환집계)과 독립적이며, 구현 시 핵심 설계에 쓸 예산을 침식한다. Phase 2 설계 경계로 기록한다.

### 2.6 reschedule(예약 변경) 플로우

**제외 근거**: reschedule은 R6(no-show 근본원인)의 대응이다. 그러나 MVP는 리마인더 알림(시뮬레이션)으로 R6에 부분 대응한다. reschedule 자체는 예약 상태 전이(CONFIRMED→RESCHEDULED→RE-CONFIRMED), 기존 슬롯 반환, 새 슬롯 동시성 재보장 등 복합 플로우를 요구하며, 2주 예산에서 독립적으로 올바르게 구현하기 어렵다. "완성된 플로우"보다 "설계된 경계"가 더 강한 신호이므로, 상태 전이 다이어그램과 API 설계를 `docs/04-system-design.md`에 명시하고 구현은 Phase 2로 배치한다.

### 2.7 비동기 상담 대안 (결과지 FAQ·텍스트 Q&A)

**제외 근거**: R7(동기 상담만 존재)에 대한 더 깊은 대응이다. 비동기 상담은 별도 채널(채팅, 게시판, 전문가 답변 큐)을 필요로 하며, 현재 도메인 모델(Booking 기반 동기 예약)과 근본적으로 다른 아키텍처를 요구한다. MVP 범위를 동기 예약 패러다임으로 고정하고, 비동기 채널 확장 경로를 Phase 2 설계 항목으로 기록한다.

### 2.8 고객 대기열(waitlist/queue) — 공석 통지·FIFO 승격·자동매칭

**제외 근거**: R4(만석 이탈)의 **1차 대안은 셀프서비스 가용 캘린더**다 — 만석 시 고객이 다른 일자·상담사의 빈 슬롯을 직접 보고 스스로 예약하면(통합 캘린더 + `availableCount`, 컴포넌트 1) 원래의 "전화 술래잡기 → 조용한 이탈" 마찰이 이미 제거된다. limited counselor pool에서는 *가용 탐색*이 대기열보다 더 높은 레버리지의 1차 해법이다. 고객 대기열(원하는 슬롯이 열리면 통지받고 FIFO로 승격받는 큐)은 그 위의 잔여 통지 수요(R8)이며, TTL/FIFO/promotion 상태기계 + 공석 통지 + 오퍼 만료/전환 추적이라는 별도 복잡도를 요구한다. 이 복잡도 대비 MVP 가치가 낮으므로 **의식적으로 Phase 2 Non-Goal로 미룬다**. 자동매칭(상담사·시간 최적 추천)은 그보다 더 위의 추천 알고리즘 과제다. "가용 캘린더로 1차 이탈을 먼저 막고 대기열을 근거 있게 미룬 것"이 단순 미구현과 다른 점이다.

---

## 3. 근본원인별 MVP 배치 근거

| # | 근본원인 | 증상 | MVP 배치 | 배치 근거 |
|---|---------|------|---------|----------|
| R1 | 예약 조정이 사람 간 비동기 통신 | 수동 예약·겹침·누락 | **MVP 구현** | 서비스의 최우선 존재 이유. 셀프서비스 예약 + DB 동시성 보장(PENDING-first + partial unique)이 없으면 전체 가치 명제가 성립하지 않는다. |
| R2 | 기록 스키마 부재 | 상담 기록 제각각·전환율 수동집계 | **MVP 구현** | 구조화 입력(outcome + 관심 제품)이 없으면 Analytics(R5 연결)의 데이터 기반이 없다. |
| R3 | 상담 대상 ≠ 계정 소유자 | 가족 결과 대리 상담 | **MVP 구현** | 대칭형 `FamilyLink`(Customer↔Customer) + TestResult 기반 subject 파생(항상 `CUSTOMER`, `subjectId`=검사결과 소유 고객) + `ACCEPTED` 링크 소유권 검증으로 경계를 유지한다. |
| R4 | 공급 희소 + 수요 집중 → 이탈 | 꽉 찬 시간대에 1차 대안 없음 | **MVP 구현 (가용 캘린더)** | 1차 대안 = **셀프서비스 가용 캘린더**(통합 캘린더 + `availableCount`). 만석 시 고객이 다른 일자·상담사 슬롯을 직접 예약하고, 취소된 슬롯은 즉시 가용 목록에 재노출된다 → "전화 술래잡기 → 조용한 이탈" 마찰 제거. 고객 대기열·자동매칭(R8)은 reasoned Phase 2 Non-Goal. |
| R5 | 기록이 논의 지표를 포착하지 않음 | 전환이 검사 결과와 분리 | **MVP 구현** | "검사 기반" 서비스의 본질이다. `ConsultationRecordMetric` 연결 없이는 Analytics가 일반 CRM과 구별되지 않는다. 지표별 전환 집계가 본 플랫폼의 차별점이므로 누락 불가. |
| R6 | 잊어버림 + 변경 마찰 | 당일 no-show | **MVP 구현** (리마인더+no-show 스윕=MVP, reschedule=Phase 2 설계) | 리마인더(시뮬레이션) + 자동 no-show 전이(`sweepNoShows`) + 상담사 수동 override(`PATCH /bookings/:id/attendance`)로 no-show 루프를 닫는다. reschedule 복합 플로우는 Phase 2로 분리해 설계 경계로 명시한다(ADR 0006). |
| R7 | 동기 상담만 존재 | 이탈의 더 깊은 대안 없음 | **Phase 2 (설계)** | 별도 채널 아키텍처가 필요하며, 동기 예약 패러다임 MVP와 병행 구현 시 범위가 급격히 확대된다. 확장 경로 명시로 "알고 미뤘음"을 증명한다. |
| R8 | 가용 캘린더로도 원하는 슬롯이 끝내 없으면 잔여 수요 소실 | "원하는 슬롯이 열리면 통지" 잔여 통지 수요 | **Phase 2 (Non-Goal, 설계)** | 가용 캘린더(R4)가 만석 1차 이탈을 막은 뒤의 잔여 수요다. 고객 대기열(공석 통지·FIFO 승격·자동매칭)은 TTL/FIFO/promotion 복잡도 대비 MVP 가치가 낮아 reasoned Non-Goal로 미루고, 설계 경계만 명시한다. |
| R9 | step-3(관리 프로그램 등록) 추적 부재 | 구매가 챌린지 등록으로 이어졌는지 측정 불가 | **MVP 구현 (BioCom finalization)** | BioCom 3-step의 step-3을 `Challenge`(시드 카탈로그) + `ChallengeEnrollment`(상담 기록 생성 시 원자적 등록)로 모델링하고, Analytics에 등록 수·등록 전환율을 추가한다. 추가는 기존 스키마/JSONB/시드에 비파괴적(additive)이며, 등록 편집·상태 전이 UX만 Phase 2로 분리한다(ADR 0007). |
