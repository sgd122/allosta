---
name: verify-backend-authz
description: NestJS 컨트롤러의 권한 2층(RolesGuard + OwnershipService)과 DTO 검증 커버리지를 정적으로 검사합니다. backend/src에 컨트롤러·라우트·DTO를 추가하거나 수정한 후 사용.
---

# 백엔드 권한 2층 검증

ADR [0010](../../../docs/05-adr/0010-server-side-access-control.md)은 권한을 **2층**으로 설계했다: Edge 미들웨어가 1차 접근제어, NestJS가 2차(서명 + **자원 소유권**, 데이터 경계). `OwnershipService`의 주석이 이를 명시한다 — "RBAC은 *이 역할이 이 엔드포인트를 호출해도 되는가*, 이 서비스는 *이 자원이 이 사용자의 것인가*".

`backend/test/rbac.spec.ts`는 **7개 엔드포인트 스팟체크**일 뿐이다. 새 컨트롤러가 가드 없이 추가되거나, 새 mutation이 소유권 검사를 건너뛰어도 어떤 테스트도 실패하지 않는다. 이 스킬이 그 드리프트 가드다.

## 목적

1. **RBAC 커버리지** — 모든 컨트롤러가 `JwtAuthGuard`로 보호되고, 라우트마다 유효 `@Roles`가 결정된다
2. **소유권 2층** — 특정 자원(`:id`)을 읽거나 변경하는 라우트가 `OwnershipService`를 경유한다
3. **DTO 검증** — 모든 `@Body()`가 class-validator 데코레이터를 가진 DTO 클래스를 받는다
4. **공개 엔드포인트 명시성** — 가드 없는 컨트롤러는 의도된 공개 엔드포인트뿐이다

## 실행 시점

- `backend/src/**/*.controller.ts`에 라우트를 추가하거나 신규 컨트롤러를 만든 후
- 서비스에 자원 조회·변경 로직을 추가한 후
- 새 DTO를 추가하거나 기존 DTO 필드를 늘린 후
- `OwnershipService`에 assert 메서드를 추가한 후
- Pull Request 생성 전

## Related Files

| File | Purpose |
|------|---------|
| `docs/05-adr/0010-server-side-access-control.md` | 권한 2층 설계의 단일 출처 |
| `docs/04-system-design.md` | §8 권한 2층 설계 |
| `backend/src/common/auth/jwt-auth.guard.ts` | 1층 — JWT 서명 검증 |
| `backend/src/common/auth/roles.guard.ts` | 1층 — 역할 기반 접근제어 |
| `backend/src/common/decorators/roles.decorator.ts` | `@Roles(...)` 메타데이터 |
| `backend/src/common/decorators/current-user.decorator.ts` | 검증된 클레임 주입 |
| `backend/src/common/ownership/ownership.service.ts` | 2층 — 자원 소유권 (`assertSubjectOwnedByCustomer`, `assertBookingOwnedByCounselor`) |
| `backend/src/common/common.module.ts` | `@Global` — 기능 모듈이 `OwnershipService`를 주입받는 경로 |
| `backend/src/main.ts` | `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) |
| `backend/src/auth/auth.controller.ts` | 유일한 공개 컨트롤러 (`POST /auth/login`) |
| `backend/test/rbac.spec.ts` | 런타임 스팟체크 (이 스킬이 보완하는 대상) |
| `backend/test/qa-scope.spec.ts` | QA 스코프 격리 런타임 검증 |

## 워크플로우

모든 명령은 `backend/` 디렉토리에서 실행한다.

### Step 1: 컨트롤러 가드 커버리지

**검사:** 모든 컨트롤러 클래스는 `JwtAuthGuard`로 보호된다.

```bash
cd backend
for f in $(find src -name '*.controller.ts' | sort); do
  ctrls=$(grep -c '^@Controller' "$f")
  guards=$(grep -c 'JwtAuthGuard' "$f")
  if [ "$guards" -eq 0 ]; then echo "NO GUARD: $f"; fi
  if [ "$ctrls" -gt "$guards" ] && [ "$guards" -gt 0 ]; then
    echo "PARTIAL: $f (@Controller x$ctrls, JwtAuthGuard x$guards)"
  fi
done
```

**PASS:** `NO GUARD: src/auth/auth.controller.ts`만 출력 (예외사항 1 참조). `PARTIAL` 0줄.
**FAIL:** 그 외 `NO GUARD`는 인증 없이 접근 가능한 엔드포인트다. 클래스에 `@UseGuards(JwtAuthGuard, RolesGuard)`를 추가한다. `PARTIAL`은 한 파일의 여러 `@Controller` 중 일부만 보호된 상태 — `availability.controller.ts`처럼 파일당 컨트롤러가 3개인 경우 각각에 가드가 필요하다.

### Step 2: 라우트별 유효 `@Roles`

**검사:** 각 HTTP 라우트는 클래스 수준 또는 메서드 수준 `@Roles`로 역할이 결정된다.

NestJS 데코레이터는 순서가 자유롭다 — `@Roles`가 `@Get(...)`의 앞에도 뒤에도 올 수 있고, 한 파일에 `@Controller` 클래스가 여럿일 수 있다. 따라서 **메서드에 붙은 연속 데코레이터 블록** 단위로 판정한다.

```bash
cd backend
cat > /tmp/roles.awk <<'AWK'
function flush() {
  if (runroute != "" && !runroles && !classroles) print "UNROLED " FILENAME ":" runline "  " runroute
  runroute = ""; runline = 0; runroles = 0
}
/^@Controller/  { classroles = 0 }
/^@Roles/       { classroles = 1 }
/^[ \t]+@/ {
  d = $0; sub(/^[ \t]+/, "", d)
  if (d ~ /^@(Get|Post|Patch|Put|Delete)\(/) { runroute = d; runline = FNR }
  if (d ~ /^@Roles/) runroles = 1
  next
}
{ flush() }
END { flush() }
AWK
for f in $(find src -name '*.controller.ts' | sort); do awk -f /tmp/roles.awk "$f"; done
```

**PASS:** 아래 3건만 출력된다 (전부 의도된 공개·공유 조회 — 예외사항 1·5 참조).

```
UNROLED src/auth/auth.controller.ts:11  @Post('login')
UNROLED src/availability/availability.controller.ts:36  @Get('availability-calendar')
UNROLED src/availability/availability.controller.ts:61  @Get(':counselorId/slots')
```

**FAIL:** 그 외 `UNROLED` 라우트는 역할 미지정이므로 `JwtAuthGuard`를 통과한 **모든 역할**에게 열린다. 해당 라우트에 `@Roles(...)`를 추가하거나, 컨트롤러 전체가 한 역할 전용이면 클래스 수준 `@Roles`를 건다.

**새 `UNROLED` 항목을 예외로 넘기기 전에** 그 라우트가 정말 모든 인증 사용자에게 열려야 하는지 코드와 ADR로 확인한다. 확인되면 라우트 위에 이유를 주석으로 남기고 위 기준선 목록에 추가한다.

### Step 3: 소유권 2층 커버리지

**검사:** 경로 파라미터로 특정 자원을 지목하는 라우트는 RBAC만으로 불충분하다 — 같은 역할의 **다른 사용자** 자원에 접근할 수 있기 때문이다.

```bash
cd backend
echo "--- 경로 파라미터를 받는 라우트 ---"
grep -rnE "^\s+@(Get|Post|Patch|Put|Delete)\('[^']*:[a-zA-Z]" src --include='*.controller.ts'
echo "--- OwnershipService를 주입하는 서비스 ---"
grep -rln 'OwnershipService' src --include='*.service.ts'
echo "--- assert 호출 지점 ---"
grep -rnE 'this\.ownership\.assert' src --include='*.service.ts'
```

**PASS:** 첫 목록의 각 라우트에 대해, 대응 서비스 메서드가 (a) `assert*` 호출, (b) Prisma `where` 절에 소유자 ID(`customerId`/`counselorId`/`slot.counselorId`)를 포함한 쿼리, 둘 중 하나로 경계를 강제한다.
**FAIL:** 소유자 조건 없이 `findUnique({ where: { id } })`로 자원을 반환·변경하면 IDOR다. `OwnershipService`에 assert 메서드를 추가하거나 쿼리에 소유자 조건을 넣는다.

기준선(스킬 생성 시점): 경로 파라미터 라우트 23개, `OwnershipService` 주입 서비스 3개(`booking`·`consultation`·`qa`), `this.ownership.assert*` 호출 11곳.
`this.ownership.` 접두사로 매칭해 주석 속 메서드명 언급을 걸러낸다. 나머지 서비스는 쿼리 스코핑(b)으로 경계를 강제한다 — Step 4로 확인한다.

### Step 4: 쿼리 스코핑

**검사:** 소유권을 쿼리로 강제하는 서비스는 `where` 절에 사용자 식별자가 들어간다.

```bash
cd backend
for f in $(find src -name '*.service.ts' | sort); do
  fu=$(grep -c 'findUnique(' "$f")
  scoped=$(grep -cE 'customerId|counselorId|subjectId' "$f")
  echo "$f: findUnique=$fu ownerRefs=$scoped"
done
```

**PASS:** `findUnique > 0`인 서비스는 `ownerRefs > 0`이거나, 해당 `findUnique`가 소유권과 무관한 조회(설정·상품 카탈로그 등)임이 코드로 확인된다.
**FAIL:** `findUnique`로 자원을 꺼내면서 소유자 참조가 전혀 없으면 해당 메서드를 직접 읽고 호출자가 소유권을 검증하는지 확인한다. 검증이 없으면 Step 3의 수정을 적용한다.

### Step 5: DTO 검증 커버리지

**검사:** `main.ts`의 `ValidationPipe`는 `whitelist: true` + `forbidNonWhitelisted: true`로 동작한다. 즉 **class-validator 데코레이터가 없는 필드는 조용히 제거되거나 요청 전체가 400으로 거부된다.** 데코레이터 누락은 런타임에 "값이 사라지는" 버그가 된다.

```bash
cd backend
echo "--- @Body 파라미터 ---"
grep -rnE '@Body\(\)' src --include='*.controller.ts'
echo "--- DTO별 class-validator 사용 ---"
for f in $(find src -path '*/dto/*.ts' | sort); do
  printf '%s: class-validator=%s\n' "$f" "$(grep -c 'class-validator' "$f")"
done
echo "--- ValidationPipe 설정 ---"
grep -nE 'whitelist|forbidNonWhitelisted|transform' src/main.ts
```

**PASS:** 모든 `@Body()`가 `*Dto` 타입을 받고, 모든 DTO 파일의 `class-validator` 카운트가 1 이상이며, `main.ts`에 세 옵션이 모두 살아 있다.
**FAIL:**
- `@Body() dto: any` 또는 인라인 객체 타입 → 전용 DTO 클래스로 교체
- `class-validator=0`인 DTO → 각 필드에 `@IsString()`·`@IsEnum()`·`@IsOptional()` 등을 부착
- `whitelist`/`forbidNonWhitelisted` 제거 → 되돌린다. 이 옵션이 DTO 검증을 실질적 경계로 만든다

기준선(스킬 생성 시점): `@Body()` 15개 전부 `*Dto` 타입, DTO 파일 11개 전부 class-validator 사용.

### Step 6: 회귀 게이트

권한 관련 수정 후 반드시 실행한다.

```bash
cd backend && npx tsc --noEmit && pnpm test:db:setup && pnpm test
```

**PASS:** 타입 에러 0, 전체 e2e 스펙 green (`rbac.spec.ts`·`qa-scope.spec.ts`·`analytics.scope.spec.ts`·`family-consent-booking.spec.ts` 포함).

> 테스트는 Docker의 `allosta-postgres` 컨테이너를 요구한다. 컨테이너가 없으면 `docker compose up -d postgres` 후 재실행한다.

## Output Format

```markdown
## 백엔드 권한 2층 검증

| # | 검사 | 결과 | 위반 |
|---|------|------|------|
| 1 | 컨트롤러 가드 커버리지 | PASS / FAIL | (파일) |
| 2 | 라우트별 유효 @Roles | PASS / FAIL | (파일:라우트) |
| 3 | 소유권 2층 커버리지 | PASS / FAIL | (라우트 → 서비스 메서드) |
| 4 | 쿼리 스코핑 | PASS / FAIL | (서비스:메서드) |
| 5 | DTO 검증 커버리지 | PASS / FAIL | (DTO 파일) |
| 6 | tsc / e2e 테스트 | PASS / FAIL | |

### 수정 제안
(위반별 구체적 수정안 — 어느 층에서 막을지 명시)
```

## 예외사항

다음은 **위반이 아닙니다**:

1. **`auth.controller.ts`에 가드 없음** — `POST /auth/login`은 정의상 공개 엔드포인트다. 토큰을 발급하는 곳이므로 토큰을 요구할 수 없다. Step 1에서 유일하게 허용되는 `NO GUARD`다.
2. **메서드 수준 `@Roles`가 클래스 수준을 덮어쓰는 경우** — `booking.controller.ts`는 클래스에 `@Roles(Role.CUSTOMER)`를 걸고 `confirm`·`attendance`만 `@Roles(Role.COUNSELOR)`로 재정의한다. NestJS의 정상적인 메타데이터 오버라이드이며, Step 2의 `class@Roles > 0` 조건을 만족한다.
3. **한 파일에 여러 `@Controller`** — `availability.controller.ts`는 `counselors`·`slots`·`admin` 세 컨트롤러를 담는다. 각각 독립적으로 `@UseGuards`를 가지면 정상이다. Step 1의 `PARTIAL` 조건이 이를 구분한다.
4. **`OwnershipService`를 주입하지 않는 서비스** — 소유권을 Prisma `where` 절로 강제하는 것도 유효한 2층이다(`analytics`·`test-result`·`family`·`availability`). 별도 서비스 경유는 다중 호출자가 있거나 로직이 자명하지 않을 때만 필요하다. Step 4가 이 경로를 확인한다.
5. **경로 파라미터가 소유권과 무관한 라우트** — `GET /counselors/:counselorId/slots`처럼 **공개 가용성 조회**는 특정 상담사의 슬롯을 누구나 봐야 예약이 가능하다. 자원이 의도적으로 공개일 때 소유권 검사가 없는 것은 정상이다.
6. **`QaThrottlerGuard` 같은 비-권한 가드** — 레이트 리밋·쿼터 가드는 `JwtAuthGuard`/`RolesGuard`를 대체하지 않고 보완한다. Step 1은 `JwtAuthGuard` 존재만 센다.
7. **DTO에 데코레이터 없는 파생 필드** — `@Exclude()`나 응답 전용 인터페이스(`*.interfaces.ts`)는 요청 본문이 아니므로 class-validator 대상이 아니다. Step 5는 `dto/` 디렉토리만 검사한다.
8. **`ops-scheduler`·`notification.scheduler.ts`** — 크론 기반 내부 작업자로 HTTP 라우트가 없다. 컨트롤러가 아니므로 Step 1~3 대상이 아니다.
