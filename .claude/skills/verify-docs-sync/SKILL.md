---
name: verify-docs-sync
description: 제출 산출물 6종(문제정의·요구사항·MVP범위·시스템설계·ADR·README)이 코드와 어긋나지 않는지 검사합니다. 코드를 변경한 후, 그리고 제출 전에 사용.
---

# 제출 산출물 동기화 검증

이 저장소는 biocom.kr 2주 과제물이고, **채점의 1차 대상은 코드가 아니라 `docs/`의 설계 문서**다. 코드는 그 설계의 뒷받침 증거다. 문서가 구현과 어긋나면 감점된다.

산출물 6종:

| # | 산출물 | 경로 |
|---|---|---|
| 1 | 문제 정의 및 요구사항 분석 | `docs/01-problem-definition.md` |
| 2 | 도출한 전체 요구사항 목록 | `docs/02-requirements.md` |
| 3 | MVP 범위 및 근거 | `docs/03-mvp-scope.md` |
| 4 | 시스템 설계 문서 | `docs/04-system-design.md` + `docs/05-adr/` |
| 5 | 구현 결과물 | `backend/` · `frontend/` |
| 6 | 전체를 매핑하는 README | `README.md` |

다른 verify 스킬은 코드가 코드와 어긋나는 것을 잡는다. **이 스킬은 문서가 코드와 어긋나는 것을 잡는다** — 그리고 그게 이 프로젝트에서 가장 비싼 종류의 드리프트다.

## 목적

1. **링크 무결성** — 문서 간 상대 링크와 이미지 참조가 실존 파일을 가리킨다
2. **ADR 형식·연속성** — ADR 번호가 연속이고 모두 상태 필드를 갖는다
3. **API 표면 동기화** — 문서가 기술하는 엔드포인트가 실제 컨트롤러 라우트와 일치한다
4. **스키마 동기화** — ERD·모델 설명이 `schema.prisma`와 일치한다
5. **README 매핑 완결성** — README가 6종 산출물을 전부 가리킨다

## 실행 시점

- 백엔드에 엔드포인트를 추가·변경·삭제한 후
- `schema.prisma`의 모델·enum을 변경한 후
- 새 ADR을 작성한 후
- 프론트엔드 화면을 추가하거나 스크린샷이 낡았을 때
- **제출 전 (필수)**

## Related Files

| File | Purpose |
|------|---------|
| `README.md` | 6종 산출물 매핑 + 실행 가이드 |
| `docs/01-problem-definition.md` | 산출물 1 |
| `docs/02-requirements.md` | 산출물 2 — 요구사항/AC 목록 |
| `docs/03-mvp-scope.md` | 산출물 3 — MVP 범위와 근거 |
| `docs/04-system-design.md` | 산출물 4 — 아키텍처·ERD·API·권한·프론트엔드 구조 |
| `docs/05-adr/` | ADR 0001–0018 |
| `docs/assets/` | 스크린샷 8종 |
| `backend/prisma/schema.prisma` | ERD의 단일 출처 |
| `backend/src/**/*.controller.ts` | API 표면의 단일 출처 |
| `frontend/src/app/` | 라우트 표면의 단일 출처 |

## 워크플로우

모든 명령은 저장소 루트에서 실행한다.

### Step 1: 링크·이미지 무결성

**검사:** 모든 상대 링크와 이미지 참조가 실존 파일을 가리킨다.

```bash
python3 - <<'PY'
import re, os, glob
bad = tot = 0
for f in glob.glob('docs/**/*.md', recursive=True) + ['README.md', 'CLAUDE.md']:
    if not os.path.exists(f): continue
    d = os.path.dirname(f)
    for m in re.finditer(r'\]\((?!https?://|mailto:|#)([^)#]+)', open(f).read()):
        p = m.group(1).strip(); tot += 1
        if not os.path.exists(os.path.normpath(os.path.join(d, p))):
            print(f"BROKEN  {f} -> {p}"); bad += 1
print(f"총 {tot}개 링크, 깨짐 {bad}개")
PY
```

**PASS:** 깨짐 0개. 기준선(스킬 생성 시점): 링크 77개(`CLAUDE.md` 포함), 깨짐 0.

**FAIL:** 각 `BROKEN` 줄이 파일 이동·삭제로 끊긴 참조다. 경로를 고치거나, 대상이 사라졌다면 문장 자체를 갱신한다. ADR 상호 참조가 특히 자주 깨진다.

### Step 2: ADR 형식·연속성

**검사:** ADR 번호가 빠짐없이 연속이고, 모든 ADR이 상태를 명시한다.

```bash
echo "--- 번호 연속성 ---"
ls docs/05-adr/ | grep -oE '^[0-9]{4}' | sort | awk '{n=$1+0; if(NR>1 && n!=prev+1) print "GAP: " prev " -> " n; prev=n} END{print "총 " NR "개, 최종 " prev}'
echo "--- 상태 필드 형식 ---"
for f in docs/05-adr/*.md; do
  if grep -qE '^\- \*\*상태\*\*' "$f"; then fmt="인라인";
  elif grep -qE '^## Status' "$f"; then fmt="## Status";
  else fmt="NONE"; fi
  echo "$fmt  $(basename $f)"
done | sort
```

**PASS:** `GAP` 0줄. 모든 ADR이 상태를 갖는다(`NONE` 0줄).

**FAIL:**
- 번호 공백 → 삭제된 ADR이 있다면 "Superseded"로 남기는 게 낫다. ADR은 이력이므로 지우지 않는다.
- `NONE` → 상태 필드를 추가한다.
- **형식 혼재** → 기준선에서 17개가 `- **상태**:` 인라인 형식, `0018-customer-ai-qa.md` 1개만 `## Status` 섹션 형식이다. 채점자가 훑을 때 눈에 띄는 불일치이므로 다수 형식으로 통일한다.

### Step 3: API 표면 동기화

**검사:** 설계 문서가 기술하는 엔드포인트가 실제 컨트롤러와 일치한다. 라우트를 추가하고 문서를 안 고치는 것이 가장 흔한 드리프트다.

```bash
echo "--- 실제 라우트 (컨트롤러 prefix + 메서드 경로) ---"
grep -rnE "^@Controller\('?([^')]*)'?\)|^\s+@(Get|Post|Patch|Put|Delete)\(" \
  backend/src --include='*.controller.ts' | sed 's|backend/src/||'
echo
echo "--- 문서가 언급하는 엔드포인트 ---"
grep -rhoE '`(GET|POST|PATCH|PUT|DELETE) /[a-zA-Z0-9/:_-]+`' docs/ README.md | sort -u
```

**PASS:** 문서에 나열된 엔드포인트가 전부 실재하고, **문서에서 다루기로 한 범위의** 라우트가 빠짐없이 문서화되어 있다.

**FAIL:**
- 문서에만 있는 엔드포인트 → 제거되었거나 이름이 바뀐 것이다. 문서를 갱신한다. **채점자가 실제로 호출해볼 수 있으므로 가장 위험한 종류다.**
- 코드에만 있는 새 엔드포인트 → `docs/04-system-design.md`의 API 절과, 요구사항 추적이 필요하면 `docs/02-requirements.md`의 AC에 반영한다.

> 두 목록의 형식이 달라 자동 diff가 불가능하다. 출력을 나란히 놓고 **직접 대조**한다. 자동화하려면 `/api/docs`의 Swagger 문서를 기준으로 삼는 편이 낫다.

### Step 4: 스키마 동기화

**검사:** ERD와 모델 설명이 `schema.prisma`와 일치한다.

```bash
echo "--- 실제 모델·enum ---"
grep -E '^model |^enum ' backend/prisma/schema.prisma | awk '{print $2}' | sort
echo "--- 문서가 언급하는 모델명 ---"
grep -rhoE '\b(User|Customer|Counselor|AvailabilitySlot|Booking|ConsultationRecord|CallLog|ConsultationBriefGuidance|Product|TestResult|Challenge|ChallengeEnrollment|Notification|FamilyLink|QaSession|QaMessage)\b' \
  docs/04-system-design.md | sort -u
echo "--- 문서에만 있고 스키마에 없는 이름 (제거된 모델 잔존) ---"
grep -rhoE '\b(Waitlist|FamilyMember|ConsultationAiSummary)\b' docs/ README.md | sort | uniq -c
```

**PASS:** 문서의 모델명이 전부 스키마에 존재한다. 마지막 명령의 출력은 0줄이 아니어도 되며, **각 출현이 이력 서술인지 현재 구조 주장인지**를 열어서 확인한다.

기준선(스킬 생성 시점) — 전부 정당한 이력 서술이므로 PASS:

| 이름 | 출현 | 성격 |
|---|---|---|
| `FamilyMember` | `05-adr/0003` 10회 | 최초 다형 설계의 대상. ADR은 결정 이력이므로 보존 |
| | `04-system-design.md:356` | "별도의 `FamilyMember` 엔티티는 **없다**" — 부재를 명시하는 문장 |
| | `04-system-design.md:453–454` | 대칭형 `FamilyLink`로 재설계하며 제거한 경위 서술 |
| | `02-requirements.md` 1회 · `README.md` 1회 | 용어 설명 맥락 |
| `Waitlist` | `05-adr/0006` 2회 | 기각된 대안 B와 Phase 2 Non-Goal 근거 |

**출현 수가 늘었다면** 새로 추가된 문장이 현재 구조를 주장하는지 확인한다.

**FAIL:** `Waitlist`·`FamilyMember`·`ConsultationAiSummary`는 마이그레이션에서 제거되었거나 이름이 바뀐 모델이다. 문서가 이들을 **현재 구조인 것처럼** 기술하고 있으면 갱신한다. ADR에서 "이렇게 했다가 제거했다"는 이력으로 언급하는 것은 정상이다.

### Step 5: README 매핑 완결성

**검사:** README가 6종 산출물을 전부 가리킨다. 채점자의 진입점이다.

```bash
echo "--- README가 링크하는 docs ---"
grep -oE 'docs/[a-zA-Z0-9/._-]+\.md' README.md | sort -u
echo "--- 실재하는 최상위 산출물 ---"
ls docs/*.md
echo "--- ADR 디렉토리 언급 ---"
grep -nE '05-adr|ADR' README.md | head -5
echo "--- 스크린샷 참조 vs 실재 ---"
grep -oE 'docs/assets/[a-zA-Z0-9._-]+' README.md docs/*.md | sed 's/.*://' | sort -u
ls docs/assets/
```

**PASS:** README가 `01`~`04` 네 문서를 모두 링크하고, ADR 디렉토리를 가리키며, 참조된 스크린샷이 전부 `docs/assets/`에 실재한다.

기준선(스킬 생성 시점): README가 `01-problem-definition` `02-requirements` `03-mvp-scope` `04-system-design`을 링크. `docs/assets/`에 스크린샷 8종.

**FAIL:** 빠진 링크를 추가한다. 참조되지 않는 스크린샷이 남아 있으면 지우거나 문서에 넣는다 — 채점자가 보지 못하는 자산은 없는 것과 같다.

### Step 6: 화면 ↔ 스크린샷 동기화

**검사:** 프론트엔드 라우트가 늘었는데 스크린샷이 그대로면 문서가 낡은 것이다.

```bash
echo "--- 프론트엔드 라우트 ---"
find frontend/src/app -name 'page.tsx' | sed 's|frontend/src/app||;s|/page.tsx||' | sort
echo "--- 스크린샷 ---"
ls docs/assets/
```

**PASS:** 주요 역할별 화면(고객 예약·결과·Q&A, 상담사 일정·브리프, 관리자 대시보드, 로그인, 알림)이 스크린샷으로 덮인다.

**FAIL:** 새 라우트가 스크린샷 없이 추가되었다면 캡처해 `docs/assets/`에 넣고 해당 문서에서 참조한다. 파일명은 기존 `NN-<화면>.png` 관례를 따른다.

### Step 7: 변경 요약

**검사:** 이번 변경이 어느 산출물을 낡게 만들었는지 명시한다.

```bash
git diff --name-only HEAD~1 2>/dev/null || git diff --name-only HEAD
```

**PASS:** 코드 변경이 있다면 같은 커밋 범위에 대응 문서 변경이 함께 있다.

**FAIL:** 코드만 바뀌고 `docs/`가 그대로면 **어떤 문서가 왜 여전히 유효한지** 명시적으로 판단해 보고한다. "확인 안 함"은 PASS가 아니다.

## Output Format

```markdown
## 제출 산출물 동기화 검증

| # | 검사 | 결과 | 위반 |
|---|------|------|------|
| 1 | 링크·이미지 무결성 | PASS / FAIL | (파일 -> 경로) |
| 2 | ADR 형식·연속성 | PASS / FAIL | (ADR 번호) |
| 3 | API 표면 동기화 | PASS / FAIL | (엔드포인트) |
| 4 | 스키마 동기화 | PASS / FAIL | (모델명) |
| 5 | README 매핑 | PASS / FAIL | (누락 링크) |
| 6 | 화면 ↔ 스크린샷 | PASS / FAIL | (라우트) |
| 7 | 변경 요약 | PASS / FAIL | (갱신 필요 문서) |

### 갱신 필요 문서
(문서별로 무엇이 낡았고 어떻게 고칠지)
```

## 예외사항

다음은 **위반이 아닙니다**:

1. **ADR이 제거된 모델·기능을 언급** — ADR은 **결정의 이력**이다. `Waitlist`를 도입했다가 제거한 경위를 ADR 0006·0013이 서술하는 것은 정확한 기록이며 드리프트가 아니다. Step 4는 `04-system-design.md`가 **현재 구조**로 기술하는 경우만 문제 삼는다.
2. **Superseded ADR의 낡은 내용** — 상태가 `Superseded`로 표시된 ADR의 본문은 당시 결정을 그대로 보존해야 한다. 후속 ADR로 갱신하지, 원문을 고치지 않는다. ADR 0009의 세그먼트 컨벤션을 ADR 0012가 정련한 것이 그 예다.
3. **문서에 없는 내부 엔드포인트** — Swagger(`/api/docs`)나 헬스체크처럼 설계 문서의 서술 대상이 아닌 라우트는 Step 3에서 누락으로 보지 않는다.
4. **스크린샷이 최신 UI와 픽셀 단위로 다름** — 색·간격의 미세한 차이는 문제가 아니다. **화면 구성이나 정보 구조가 달라졌을 때**만 재촬영이 필요하다.
5. **`CLAUDE.md`·`.claude/skills/**`** — 에이전트 도구 설정이지 제출 산출물이 아니다. 6종에 포함되지 않으므로 이 변경만으로 문서 갱신 의무가 생기지 않는다.
6. **`docs/02-requirements.md`가 MVP 밖 요구사항을 포함** — 산출물 2는 **도출한 전체 요구사항**이고 산출물 3이 그중 MVP 범위를 고른다. 구현되지 않은 요구사항이 목록에 있는 것은 설계상 정상이며, 오히려 없으면 감점 요인이다.
