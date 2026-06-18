# ADR 0003: 다형 상담 대상(Polymorphic Subject) — enum+id 페어 채택

- **상태**: 대체됨 (Superseded) — 대칭형 Customer↔Customer `FamilyLink` 재설계로 대체
- **날짜**: 2026-06-09
- **결정자**: 설계자 (솔로 과제)

**결정 (한 줄):** `(subjectType: enum, subjectId: uuid)` 페어를 채택한다. DB 참조 무결성은 서비스 레이어 소유권 가드와 통합 테스트로 보강한다. *(이후 대칭형 FamilyLink 재설계로 대체됨)*

---

> ⚠️ **Superseded (대체됨)**
>
> 이 ADR이 채택한 다형 subject 설계(`subjectType ∈ {CUSTOMER, FAMILY_MEMBER}` + `subjectId`로 `Customer` 또는 `FamilyMember`를 다형 참조)는 이후 **대칭형 `FamilyLink` 재설계**로 대체되었다(`20260609090000_symmetric_family_link` 마이그레이션).
>
> **현재 모델**: `FamilyMember` 1급 엔티티를 제거하고 가족 구성원도 자체 `Customer` 계정을 보유한다. 따라서 예약/검사결과의 `subjectType`은 **항상 `CUSTOMER`**이며(`FAMILY_MEMBER` enum 값 제거), `subjectId`는 검사결과를 소유한 고객을 가리킨다. 가족 검사결과 접근은 두 `Customer`를 잇는 **`ACCEPTED` 상태의 대칭형 `FamilyLink`**(`inviterCustomerId`/`inviteeCustomerId`, 양방향)를 통해 파생된다. 소유권 검증은 "본인 OR `ACCEPTED` FamilyLink 파트너"를 허용한다.
>
> 최신 설계는 [`docs/04-system-design.md` §4](../04-system-design.md#4-subject-파생-및-가족-연결-설계)를 참조한다.  
> 아래 본문은 당시 결정의 역사적 기록으로 보존한다.

---

## Context (결정 배경)

`Booking`과 `TestResult`의 상담 대상(subject)은 `Customer` 또는 `FamilyMember` 중 하나다. 관계형 DB에서 "두 테이블 중 하나를 참조하는 FK"를 표현하는 순수한 방법이 없으므로, 다형 참조를 어떻게 모델링할지 결정해야 한다.

요구사항:

- 보호자(Customer)가 본인 또는 본인 소속 FamilyMember를 상담 대상으로 지정할 수 있어야 한다.
- 타인의 FamilyMember를 지정하는 것은 차단되어야 한다(소유권 검증).
- 상담사가 상담 기록에서 대상의 검사 지표를 조회할 수 있어야 한다.
- 향후 상담 대상 유형이 추가될 경우(예: 기업 단체 검진 대상) 모델 확장이 용이해야 한다.

---

## Decision (결정)

**`(subjectType: enum, subjectId: uuid)` 페어를 `Booking`과 `TestResult`에 두는 방식을 채택한다.**

```prisma
enum SubjectType {
  CUSTOMER
  FAMILY_MEMBER
}

model Booking {
  // ...
  subjectType SubjectType
  subjectId   String      // Customer.id 또는 FamilyMember.id
}

model TestResult {
  // ...
  subjectType SubjectType
  subjectId   String
}
```

DB 레벨 참조 무결성은 보장되지 않는다. 이를 다음 두 가지로 보강한다.

1. **서비스 레이어 소유권 가드**: 예약 생성 시 `subjectType`에 따라 올바른 테이블(`Customer` 또는 `FamilyMember`)을 조회하고, 해당 레코드가 요청 고객 소속인지 검증한다.
2. **통합 테스트**: 다음 세 케이스를 `rbac.spec.ts`로 증명한다.
   - 본인 subject → 성공
   - 본인 FamilyMember subject → 성공
   - 타인 FamilyMember subject → 403

---

## Alternatives Considered (검토된 대안)

| 옵션 | 장점 | 단점 | 비채택 이유 |
|------|------|------|------------|
| **enum+id 페어 (채택)** | 구현 단순; 쿼리 명료(`WHERE subjectType = 'FAMILY_MEMBER' AND subjectId = :id`); 새 subject 유형 추가 시 enum 확장만 필요 | DB 레벨 참조 무결성 없음 → 서비스 가드 의존; 잘못된 subjectId가 삽입될 경우 DB가 감지 불가 | — (채택, 단 무결성 보강 명시) |
| **2 nullable FK + CHECK(exactly-one)** | DB 레벨 참조 무결성 보장; `customer_id` / `family_member_id` FK가 각각 인덱스 지원 | subject 유형 추가 시 컬럼·CHECK 제약 마이그레이션 필요; 쿼리에 COALESCE·CASE가 증가; CHECK constraint가 DB마다 달라 이식성 주의 | **더 안전한 대안임을 인지하고도 의도적으로 비채택.** 확장성(새 subject 유형 추가)과 쿼리 단순성을 위해 DB 무결성을 서비스 레이어 가드로 양보하는 결정이다. "더 안전한 대안을 알고 근거 있게 다른 선택을 했다"는 서술이 단순 채택 서술보다 강한 설계 신호다. |
| **단일 테이블 상속 (STI)** | 단일 테이블로 subject 통합 | Customer와 FamilyMember의 필드 집합이 달라 null 컬럼 낭비; 관계형 쿼리 복잡도 증가 | Customer·FamilyMember는 독립된 관계를 가지는 1급 엔티티이므로 STI 적합도 낮음 |
| **별도 Subject 추상 테이블** | FK 무결성 + 다형 지원 | 추가 JOIN; 마이그레이션 복잡도; 2엔티티 한정 과제에서 과도한 추상화 | YAGNI — 현재 2개 엔티티에 추상 레이어 도입은 설계 복잡도 대비 이득 낮음 |

### 안전한 대안(2 nullable FK)을 비채택한 이유 — 명시적 트레이드오프

대안 (2 nullable FK + CHECK)은 DB 레벨 참조 무결성을 보장하는 더 안전한 선택이다.
enum+id를 채택한 것은 다음 두 가지를 명시적으로 양보한 결정이다.

- **양보한 것**: DB가 잘못된 subjectId 삽입을 거부하는 능력.
- **얻은 것**: 새 subject 유형(예: `CORPORATE_MEMBER`) 추가 시 컬럼 마이그레이션 없이 enum 확장만으로 처리 가능한 확장성, 그리고 `WHERE subjectType = X AND subjectId = Y` 형태의 단순 쿼리.

양보한 무결성은 서비스 레이어 소유권 가드와 통합 테스트로 보강한다.
이 보강이 "어떤 조건에서 안전한가"를 서술하는 것이 단순 채택보다 신뢰도 높은 설계 문서다.

---

## Consequences (결과와 트레이드오프)

**긍정적 영향**

- 예약 생성·조회 쿼리가 단순하다(`subjectType`으로 분기, `subjectId`로 조회).
- 새로운 subject 유형 추가 시 enum 확장 + 서비스 가드 분기 추가만으로 처리된다(컬럼 마이그레이션 없음).
- 테스트로 소유권 검증 정확성을 증명하므로 DB 무결성 미보장의 리스크를 관리 가능한 수준으로 낮춘다.

**트레이드오프 / 부정적 영향**

- DB가 고아 레코드(존재하지 않는 subjectId)를 거부하지 않는다. 서비스 레이어 가드가 누락되면 조용한 데이터 오염이 발생할 수 있다.
- Prisma 쿼리에서 subject를 JOIN하려면 `subjectType`에 따라 동적으로 테이블을 선택해야 한다. Prisma의 type-safe JOIN이 다형 참조를 직접 지원하지 않으므로, 별도 서비스 메서드로 분기 처리한다.

---

## Follow-ups (후속 과제)

- 서비스 레이어 소유권 가드를 `SubjectOwnershipGuard` 공통 유틸로 추출해 Booking·TestResult·ConsultationRecord 전반에 일관 적용.
- 새 subject 유형 추가 시 소유권 검증 로직 확장 체크리스트를 설계 문서에 기록.
- Phase 2에서 기업 단체 검진(`CORPORATE_MEMBER`) 요구가 생기면 enum 확장 + 가드 분기 추가로 대응 가능함을 확인.
