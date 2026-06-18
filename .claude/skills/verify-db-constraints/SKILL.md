---
name: verify-db-constraints
description: 동시성 방어를 담당하는 DB 제약(부분 unique 인덱스·GiST EXCLUDE)의 생존과 애플리케이션 측 위반 핸들링, 다형 subject 페어 무결성을 검사합니다. Prisma 스키마·마이그레이션·예약/가족 로직을 변경한 후 사용.
---

# DB 제약 무결성 검증

이 프로젝트는 동시성 방어를 **애플리케이션 락이 아니라 DB 제약**에 맡기기로 결정했다 ([ADR 0002](../../../docs/05-adr/0002-concurrency-strategy.md), [ADR 0015](../../../docs/05-adr/0015-customer-temporal-overlap.md)). 그 제약들은 **`schema.prisma`에 표현할 수 없어 raw SQL 마이그레이션에만 존재한다** — Prisma가 부분 unique 인덱스와 GiST EXCLUDE를 지원하지 않기 때문이다.

결과적으로 이 제약들은 **타입체커도 Prisma도 지켜주지 않는다.** 누군가 `prisma migrate dev`로 스키마에서 마이그레이션을 재생성하면 조용히 사라지고, 동시 예약이 통과하기 시작한다. 이 스킬이 그 가드다.

## 목적

1. **제약 생존** — 부분 unique 인덱스와 GiST EXCLUDE 제약이 마이그레이션에 살아 있다
2. **위반 핸들링** — insert-first 후 P2002 / 23P01을 잡아 409로 변환하는 경로가 유지된다
3. **다형 subject 무결성** — `(subjectType, subjectId)` 페어가 항상 함께 다뤄진다 ([ADR 0003](../../../docs/05-adr/0003-polymorphic-subject.md))
4. **마이그레이션 이력 일관성** — DROP된 제약을 참조하는 코드가 남지 않는다
5. **런타임 증명** — 동시성 테스트가 실제로 제약을 때린다

## 실행 시점

- `backend/prisma/schema.prisma`를 수정한 후
- `backend/prisma/migrations/`에 마이그레이션을 추가한 후
- `booking.service.ts`·`family.service.ts`의 생성/취소 경로를 변경한 후
- `BookingStatus`·`SubjectType`·`FamilyLinkStatus` enum 값을 추가·변경한 후
- Pull Request 생성 전

## Related Files

| File | Purpose |
|------|---------|
| `docs/05-adr/0002-concurrency-strategy.md` | DB unique constraint 채택 결정 |
| `docs/05-adr/0015-customer-temporal-overlap.md` | GiST EXCLUDE 채택 결정 |
| `docs/05-adr/0003-polymorphic-subject.md` | `enum + id` 페어 채택 결정 |
| `backend/prisma/schema.prisma` | 모델·enum 정의 (제약은 여기 없음) |
| `backend/prisma/migrations/20260609031427_booking_partial_unique/migration.sql` | `booking_slot_confirmed_unique` 최초 생성 |
| `backend/prisma/migrations/20260609070100_booking_pending_first/migration.sql` | 위를 DROP하고 `booking_slot_active_unique`로 확장 |
| `backend/prisma/migrations/20260609090000_symmetric_family_link/migration.sql` | `family_link_accepted_pair_unique` |
| `backend/prisma/migrations/20260612140000_customer_no_overlap/migration.sql` | `btree_gist` 확장 + `booking_customer_no_overlap` EXCLUDE |
| `backend/src/booking/booking.service.ts` | P2002 / 23P01 catch → 409 |
| `backend/src/family/family.service.ts` | P2002 catch → 409 (booking 패턴 미러) |
| `backend/test/booking.concurrency.spec.ts` | 슬롯 경합 런타임 증명 |
| `backend/test/booking.self-overlap.spec.ts` | 고객 시간 중복 런타임 증명 |
| `backend/test/family.spec.ts` | 가족 링크 중복 런타임 증명 |

## 워크플로우

모든 명령은 `backend/` 디렉토리에서 실행한다.

### Step 1: 제약 생존 확인

**검사:** 세 개의 살아 있는 제약이 마이그레이션에 존재하고, DROP 이후 재생성되지 않은 채 남아 있지 않다.

```bash
cd backend
echo "--- 생성/삭제 이력 (시간순) ---"
grep -rn 'CREATE UNIQUE INDEX\|DROP INDEX\|ADD CONSTRAINT\|DROP CONSTRAINT' prisma/migrations/*/migration.sql \
  | grep -E 'booking_slot_(confirmed|active)_unique|family_link_accepted_pair_unique|booking_customer_no_overlap' \
  | sed 's|prisma/migrations/||' | sort
echo "--- btree_gist 확장 ---"
grep -rn 'CREATE EXTENSION' prisma/migrations/*/migration.sql
```

패턴은 제약 **이름 전체**로 매칭한다 — `booking_slot`처럼 느슨하게 잡으면 `Booking_slotId_fkey` 외래키가 섞여 들어온다.

**PASS:** 아래 최종 상태가 성립한다.

```
booking_slot_confirmed_unique   → 생성(20260609031427) 후 DROP(20260609070100)  [의도된 대체]
booking_slot_active_unique      → 생성(20260609070100), DROP 없음               [살아 있음]
family_link_accepted_pair_unique→ 생성(20260609090000), DROP 없음               [살아 있음]
booking_customer_no_overlap     → 생성(20260612140000), DROP 없음               [살아 있음]
CREATE EXTENSION IF NOT EXISTS btree_gist                                       [필수 선행]
```

**FAIL:** 살아 있어야 할 제약이 DROP됐거나 사라졌다면 **동시 예약이 통과한다**. 마이그레이션을 되돌리거나 제약을 재생성하는 새 마이그레이션을 추가한다. `btree_gist`가 없으면 EXCLUDE 제약 자체가 생성 실패한다(스칼라 등가 컬럼과 range를 한 GiST 인덱스에 넣으려면 필요).

### Step 2: EXCLUDE 제약의 의미 보존

**검사:** GiST EXCLUDE는 세 가지 세부 결정에 의존한다 — 어느 하나만 바뀌어도 동작이 달라진다.

```bash
cd backend
sed -n '/ADD CONSTRAINT "booking_customer_no_overlap"/,/;/p' \
  prisma/migrations/20260612140000_customer_no_overlap/migration.sql
```

**PASS:** 세 요소가 모두 그대로다.
- `"customerId" WITH =` — 같은 고객끼리만 비교
- `tsrange("slotStartAt", "slotEndAt") WITH &&` — **반개구간 `[)`**. 연속 예약(10–11, 11–12)은 겹치지 않음
- `WHERE ("status" IN ('PENDING', 'CONFIRMED'))` — ACTIVE만 대상. 취소 후 재예약 허용

**FAIL:** `tsrange`를 `tstzrange`나 폐구간으로 바꾸면 연속 예약이 거부된다. `WHERE` 절의 상태 집합이 `booking_slot_active_unique`와 어긋나면 두 제약이 서로 다른 "활성"을 뜻하게 되어 한쪽만 통과하는 구멍이 생긴다. 두 제약의 상태 집합은 **항상 같아야 한다.**

### Step 3: 위반 핸들링 경로

**검사:** 제약이 살아 있어도 애플리케이션이 위반을 잡아 409로 바꾸지 않으면 500이 나간다.

```bash
cd backend
echo "--- 에러 코드 상수 ---"
grep -rn "P2002\|23P01" src --include='*.ts' | grep -v '^\s*\*'
echo "--- catch 지점 ---"
grep -rn 'PrismaClientKnownRequestError\|ConflictException' src --include='*.service.ts'
```

**PASS:** `booking.service.ts`가 `P2002`(unique)와 `23P01`(exclusion_violation) 둘 다 처리하고, `family.service.ts`가 `P2002`를 처리하며, 각각 `ConflictException`으로 변환한다.

**FAIL:** 새로 추가한 제약에 대응하는 catch가 없으면 사용자가 409 대신 500을 본다. insert-first / catch 패턴을 따른다 — **미리 SELECT로 확인하고 INSERT하는 방식은 금지다**(확인과 삽입 사이에 경합 창이 열려 제약을 두는 의미가 사라진다).

> `23P01`은 Prisma가 전용 코드 없이 `UnknownRequestError`로 노출하므로 `message`에 `23P01`과 제약 이름이 함께 들어 있는지로 판별한다. 이 우회는 의도된 것이며 `booking.service.ts`에 근거 주석이 있다.

### Step 4: 다형 subject 페어 무결성

**검사:** `(subjectType, subjectId)`는 하나의 논리 단위다. 한쪽만 읽거나 쓰면 다른 타입의 자원을 가리키게 된다.

```bash
cd backend
echo "--- subjectId 언급 ---"; grep -rn 'subjectId' src --include='*.ts' | grep -v '^\s*\*' | wc -l
echo "--- subjectType 언급 ---"; grep -rn 'subjectType' src --include='*.ts' | grep -v '^\s*\*' | wc -l
echo "--- subjectId만 있고 subjectType이 없는 select/where 블록 ---"
grep -rn -A3 'subjectId:' src --include='*.service.ts' | grep -B1 -A2 'subjectId' | grep -v 'subjectType' | head -20
```

**PASS:** `subjectId`를 다루는 모든 `select`/`where`/객체 리터럴이 같은 블록에서 `subjectType`도 다룬다. `OwnershipService.assertSubjectOwnedByCustomer`가 `subjectType !== CUSTOMER`를 먼저 거부하는 것이 이 계약의 집행 지점이다.

**FAIL:** `subjectId`만으로 자원을 조회하면 서로 다른 `subjectType`의 동일 id가 충돌할 수 있다. 페어를 함께 실어라.

### Step 5: 스키마 ↔ 마이그레이션 드리프트

**검사:** `schema.prisma`를 고치고 마이그레이션을 만들지 않았거나, 그 반대인 상태를 잡는다.

```bash
cd backend
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "$DATABASE_URL" \
  --exit-code
```

**PASS:** exit code 0 — 마이그레이션 이력과 스키마가 일치한다.
**FAIL:** exit code 2 — 차이가 있다. 출력된 diff를 읽고 마이그레이션을 추가한다. **`prisma migrate dev`로 마이그레이션을 재생성하지 마라** — raw SQL 제약(Step 1의 3개)이 소실된다. 차이분만 담은 새 마이그레이션을 손으로 쓴다.

> 셸 DB가 없으면 이 단계는 건너뛰고 Step 6의 런타임 증명으로 대체한다.

### Step 6: 런타임 증명

**검사:** 제약이 실제로 경합을 막는지는 테스트만이 증명한다.

```bash
cd backend && pnpm test:db:setup && npx jest --config ./test/jest-e2e.json --runInBand \
  test/booking.concurrency.spec.ts test/booking.self-overlap.spec.ts test/family.spec.ts
```

**PASS:** 세 스펙 green. 출력을 그대로 보고한다.
**FAIL:** 제약이 사라졌거나 catch 경로가 끊긴 것이다. Step 1~3으로 돌아간다.

> Docker `allosta-postgres` 컨테이너가 필요하다. 없으면 `docker compose up -d postgres`.

## Output Format

```markdown
## DB 제약 무결성 검증

| # | 검사 | 결과 | 위반 |
|---|------|------|------|
| 1 | 제약 생존 | PASS / FAIL | (제약명) |
| 2 | EXCLUDE 의미 보존 | PASS / FAIL | (변경된 요소) |
| 3 | 위반 핸들링 경로 | PASS / FAIL | (서비스:메서드) |
| 4 | 다형 subject 페어 | PASS / FAIL | (파일:줄) |
| 5 | 스키마 ↔ 마이그레이션 | PASS / FAIL / SKIP | (diff 요약) |
| 6 | 런타임 증명 | PASS / FAIL | (스펙명) |

### 수정 제안
(위반별 구체적 수정안 — 마이그레이션 재생성은 절대 제안하지 않는다)
```

## 예외사항

다음은 **위반이 아닙니다**:

1. **`booking_slot_confirmed_unique`의 DROP** — 의도된 대체다. `20260609070100_booking_pending_first`가 PENDING을 활성 집합에 넣으면서 `booking_slot_active_unique`로 확장했다. 삭제된 이름을 참조하는 코드가 없는지만 확인하면 된다.
2. **`Waitlist` 관련 DROP CONSTRAINT** — `20260612130000_remove_waitlist`가 기능 자체를 제거했다. 사라진 테이블의 제약이 없는 것은 정상이다.
3. **`User_email_key` 같은 Prisma 생성 unique 인덱스** — `@unique` 어트리뷰트에서 자동 생성되므로 `schema.prisma`가 단일 출처다. Step 1은 raw SQL로만 존재하는 3개 제약만 대상으로 한다.
4. **`subjectType` 없이 `subjectId`만 쓰는 UI 전용 코드** — 이미 상위에서 타입이 좁혀진 뒤 id만 표시·전달하는 프론트엔드 경로는 대상이 아니다. Step 4는 `backend/src/**/*.service.ts`의 쿼리 블록만 본다.
5. **`prisma migrate diff` SKIP** — 셸에서 DB에 붙을 수 없는 환경(CI 아닌 로컬, 컨테이너 미기동)에서는 Step 5를 건너뛰고 Step 6으로 대체하는 것이 정상 운영이다. 단 SKIP했다는 사실을 보고서에 반드시 남긴다.
