# exammoa — Claude Code 작업 지침

준비하는 시험 여러 개의 원서접수·시험·발표 일정을 가로 타임라인에 올려 **겹치는 구간을 찾아주는** 정적 사이트. 백엔드 없음, 하루 1회 배치로 정적 JSON 생성.

읽는 순서: `README.md` → `docs/데이터-수집-활용.md`(수집 경로와 다음 계획) → `docs/reference/데이터-스키마.md`(필드 계약).

---

## 명령

```bash
npm run collect        # API·크롤 수집 → data/published/*.json  (QNET_KEY 필요)
npm run publish:data   # data/published/ → public/data/  (화면이 읽는 경로)
npm run dev            # predev 가 publish:data 를 먼저 돌린다
npm test               # node --test. scripts/**/*.test.mjs + src/**/*.test.ts
npm run typecheck      # 오류 0 을 유지한다
npm run check          # PR 전 체크 한 방 = test + typecheck + 산출물 점검
npm run probe          # Q-Net API 진단
npm run probe:crawl    # 기관 페이지 크롤링 가능성 진단
```

수집 산출물은 `data/published/` 다. `build/` 는 진단·스크래치 전용이고 `.gitignore` 대상이다.

`QNET_KEY` 는 `.env` 에 있고 **URL 인코딩된 상태(`%3D%3D`)로 그대로** 넣는다. `URLSearchParams` 로 감싸면 `%` 가 이중 인코딩되어 인증이 깨진다.

---

## 반드시 지킬 것

**1. 일정의 주체는 종목이 아니라 시행그룹이다.**
`Session` 은 `groupId` 를 갖는다. `examSlug` 로 되돌리지 말 것. 실측: 47종목의 일정이 실제로 7가지뿐이라 종목별로 행을 그리면 같은 막대가 29줄 반복된다.

**2. `groupId` 는 선언하고, 동일성은 검증한다.**
`data/groups.seed.json` 에 사람이 선언하고 `foldGroups()` 가 실제 일정이 같은지 확인한다. 일정 지문을 그룹 id 로 쓰면 회차가 바뀔 때마다 id 가 흔들려 URL 공유와 `ExamPlan.sessionId` 가 깨진다. 갈리면 조용히 하나를 고르지 말고 `meta.groupSplits` 에 남기고 종료코드 1.

**3. `robots.txt` 를 어기지 않는다.**
`dataq.or.kr` · `cq.or.kr` · `opic.or.kr` 은 `Disallow: /` 다. 대한상의 `/kor/` 도 금지다 (FR-DAT-11 완료조건). 자동 수집 대상만 `sourceUrl`, 링크 전용은 `agencyUrl` — 필드 이름으로 구분을 강제한다. 새 수집 대상을 추가할 때는 `npm run probe:crawl` 로 먼저 확인한다.

**4. 날짜를 추측해서 만들지 않는다.**
파싱 실패는 `null` 이고 이벤트를 만들지 않는다. `미정`·`-` 에 날짜를 부여하면 사용자가 접수를 놓친다. `2026.02.29` 같은 값은 `new Date` 가 3/1 로 굴려버리므로 직접 검산한다.

**5. 상시시험(rolling)에 막대를 그리지 않는다.**
컴활·워드·OPIc·ITQ 는 확정 회차가 없다. `mode: 'rolling'`, `events: []`, `rollingRule` 로 규칙 카드만 낸다. `status: 'tbd'`(미공고)와 혼동하지 말 것 — 둘 다 `events` 가 비지만 완전히 다른 정보다.

**6. 사람이 고치는 파일과 기계가 쓰는 파일을 섞지 않는다.**
`data/*.seed.json` · `data/manual-schedules.json` 은 사람. `data/published/` · `data/archive/` 는 기계(하루 1회 배치가 커밋한다). 수집 결과를 시드에 자동 커밋하면 cron 이 사람의 수정을 덮는다.

**7. 부분 실패로 전체를 멈추지 않는다.**
소스 하나가 죽어도 나머지로 빌드가 성공해야 한다 (FR-DAT-06). 산출물을 먼저 쓰고 그다음 종료코드로 알린다. 낡은 데이터를 **낡았다고 밝히면서** 보여주는 것이 사라지는 것보다 낫다 (FR-DAT-07).

**8. 종료코드 1 을 뭉치지 않는다.**
`collect.mjs` 는 두 가지 다른 이유로 1 을 낸다. **소스 실패**는 직전 값이 `stale` 로 유지되므로 산출물이 유효하다 — 커밋해야 폴백이 저장소에 남는다. **그룹 갈림**은 `groupId` 가 바뀌므로 커밋하면 사용자가 저장한 계획과 공유된 `?p=` 링크가 깨진다 — 커밋하지 않는다. 판정은 `scripts/ci-gate.mjs` 한 곳에만 둔다. 워크플로 YAML 안에서 다시 판정하지 말 것 (테스트할 수 없다).

---

## git 형상관리

`main` 에 직접 커밋하지 않는다. 항상 이슈 → 브랜치 → 커밋 분리 → PR.

```bash
gh issue create --title "..." --body "..."
git switch -c <type>/<issue번호>-<요약>
# 논리 단위로 커밋을 쪼갠다
gh pr create --fill
```

**브랜치 이름**: `feat/` `fix/` `docs/` `chore/` `refactor/` + 이슈 번호. 예: `feat/12-stale-fallback`

**커밋 분리 기준** — "이 커밋만 되돌릴 수 있는가"로 판단한다.
- 데이터 시드 변경과 그것을 읽는 코드 변경은 나눈다
- 타입 계약 변경과 그에 맞춘 구현은 나눈다
- 버그 수정은 기능 변경과 섞지 않는다
- 문서 갱신은 별도 커밋 (리뷰어가 코드만 볼 수 있게)

**커밋 메시지**: 첫 줄은 한국어 명령형 요약 50자 내. 본문에는 **왜**를 쓴다. 무엇을 바꿨는지는 diff 가 말해준다.

```
그룹 접기 추가로 47종목을 7행으로 줄임

종목별로 행을 그리면 실측상 같은 막대가 29줄 반복된다.
groupId 는 시드에 선언하고 동일성은 수집 시점에 검증한다.
```

**PR 전 체크**: `npm run check` (test + typecheck + `groupSplitCount` 0). `.github/workflows/ci.yml` 이 PR 에서 같은 것을 돌린다.

`npm run collect` 는 CI 에서 돌지 않는다 — 외부 기관 사이트가 죽은 날 코드 리뷰가 막히면 안 된다. 수집 경로를 건드린 PR 은 손으로 한 번 돌려 보고 종료코드를 확인한다.

---

## 함정 (실측으로 확인된 것)

- **API 응답에 종목 식별자가 없다.** 요청 시 넣은 `jmCd` 로만 귀속 가능 → 종목별 루프가 불가피하다. 이 중복이 그룹 무결성 검사를 공짜로 준다.
- **잘못된 `jmCd` 는 오류 없이 엉뚱한 종목을 준다.** 화이트리스트로만 호출한다.
- **응답 0건은 오류가 아니다.** `1324`·`1325`·`0492`·`0493`·`0488`·`0483` 은 타기관 시행이라 정상적으로 빈 응답이다.
- **그러나 지금 코드는 429 도 0건으로 읽는다** (이슈 #18, 미해결). 일일 요청 제한을 넘기면 `LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR` 를 주는데, 이게 "레코드 없음" 으로 집계돼 29종목이 조용히 사라졌다. **`health: 'ok'` · 종료코드 0 · stale 폴백 미작동.** 개발계정 한도는 일 1,000, 1회 수집이 47회 → **하루 21회 이상 돌리지 말 것.** 손으로 여러 번 돌린 날은 `meta.failed` 를 반드시 확인한다.
- **필기시험은 기간 시행(CBT)이다.** 정보처리기사 필기가 26일. 시험이 점이 아니라 막대이고, 기간끼리 겹쳐도 응시일을 고르면 피할 수 있어 `blocking` 에서 제외한다 (`isFlexible`, 4일 이상).
- **한 회차에 접수 구간이 2개다.** 정기접수 + 빈자리접수 → `reg` 의 `seq` 1·2.
- **과거 연도 조회가 안 된다.** `implYy=2024` 빈 응답. 매 수집 시 원본을 `build/raw/` 에 보존한다.
- **한국 시험표는 셀에 `M.D(요일)` 로 쓰고 연도는 제목에 한 번만 적는다.** 4자리 연도를 요구하는 정규식은 대부분의 표를 놓친다.
- **`robots.txt` 404 는 전면 허용이다** (RFC 9309). "판단 불가"로 처리하면 한능검처럼 값어치 있는 대상을 스스로 차단한다.
