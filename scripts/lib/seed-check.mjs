// 시드 무결성 검사. 의존성 없음.
//
// 사람이 고치는 파일 두 개(`exams.seed.json`·`groups.seed.json`)가 서로를 가리키는데,
// **한쪽 방향만 검사하고 있었다.** `collect.mjs` 는 종목→그룹만 봤고 그룹→종목은 아무도
// 보지 않았다. 그 결과 같은 형태의 구멍을 **네 번** 손으로 찾았다.
//
//   kdata-sqld·kdata-adsp → 없는 종목 (PR #23 에서 발견)
//   kait-linux            → 없는 종목 (PR #27)
//   kacpta-tax            → 없는 종목 (PR #27)
//   kpc-itq               → 없는 종목 (PR #28)
//
// 그룹만 있고 종목이 없으면 화면에 아무것도 안 나온다. **조용히.** 수집은 성공하고,
// 게이트는 초록이고, 그 종목만 없다. 이 파일은 그 실패를 시끄럽게 만든다.
//
// 검사는 네트워크를 타지 않으므로 수집 맨 앞에서 돌린다 — 시드가 깨진 채로 47번
// 호출할 이유가 없다.

/** 발견한 문제 하나 */
const problem = (code, message) => ({ code, message });

/**
 * @param {{exams:object[], tiers?:object, categories?:object[]}} examSeed
 * @param {{groups:object[]}} groupSeed
 * @returns {{ok:boolean, problems:{code:string,message:string}[]}}
 */
export function checkSeeds(examSeed, groupSeed) {
  const problems = [];
  const exams = examSeed?.exams ?? [];
  const groups = groupSeed?.groups ?? [];

  if (!exams.length) problems.push(problem('empty-exams', 'exams.seed.json 에 종목이 없다'));
  if (!groups.length) problems.push(problem('empty-groups', 'groups.seed.json 에 그룹이 없다'));

  const bySlug = new Map();
  for (const e of exams) {
    if (bySlug.has(e.slug)) problems.push(problem('dup-exam', `종목 slug 중복: ${e.slug}`));
    bySlug.set(e.slug, e);
  }
  const byId = new Map();
  for (const g of groups) {
    if (byId.has(g.id)) problems.push(problem('dup-group', `그룹 id 중복: ${g.id}`));
    byId.set(g.id, g);
  }

  // ---- 양방향 참조 ----------------------------------------------------
  //
  // 한 방향만 보면 반대쪽 구멍이 조용히 남는다. 네 번 겪었다.

  for (const e of exams) {
    if (!e.groupId) {
      problems.push(problem('exam-no-group', `${e.slug} 에 groupId 가 없다`));
      continue;
    }
    const g = byId.get(e.groupId);
    if (!g) {
      problems.push(problem('exam-dangling-group', `${e.slug} 이 없는 그룹을 가리킨다: ${e.groupId}`));
      continue;
    }
    if (!(g.examSlugs ?? []).includes(e.slug)) {
      problems.push(problem('membership-one-way',
        `${e.slug} 은 ${g.id} 소속인데 ${g.id}.examSlugs 에 없다`));
    }
  }

  for (const g of groups) {
    const slugs = g.examSlugs ?? [];
    if (!slugs.length) {
      problems.push(problem('group-empty', `${g.id} 에 examSlugs 가 없다 — 화면에 아무것도 안 나온다`));
    }
    for (const slug of slugs) {
      const e = bySlug.get(slug);
      if (!e) {
        // 네 번 겪은 그 구멍이다
        problems.push(problem('group-dangling-exam',
          `${g.id}.examSlugs 가 없는 종목을 가리킨다: ${slug}`));
        continue;
      }
      if (e.groupId !== g.id) {
        problems.push(problem('membership-mismatch',
          `${g.id}.examSlugs 에 ${slug} 이 있는데 ${slug}.groupId 는 ${e.groupId} 다`));
      }
    }
  }

  // ---- 선언한 값만 쓴다 ------------------------------------------------
  //
  // tier·category 목록을 여기 하드코딩하지 않는다. 시드가 스스로 선언한 것과 맞춘다 —
  // 목록이 두 곳에 있으면 언젠가 갈린다.

  const tiers = new Set(Object.keys(examSeed?.tiers ?? {}));
  const categories = new Set((examSeed?.categories ?? []).map(c => c.id));
  for (const e of exams) {
    if (tiers.size && !tiers.has(e.tier)) {
      problems.push(problem('unknown-tier', `${e.slug} 의 tier '${e.tier}' 가 tiers 선언에 없다`));
    }
    if (categories.size && !categories.has(e.category)) {
      problems.push(problem('unknown-category', `${e.slug} 의 category '${e.category}' 가 categories 에 없다`));
    }
  }

  // ---- 화면 필수 표기 --------------------------------------------------
  //
  // 기관 표기가 없으면 "빅데이터분석기사" 가 공단 정기 일정으로 오인된다.

  for (const g of groups) {
    if (!g.agency) problems.push(problem('group-no-agency', `${g.id} 에 agency 가 없다 — 화면 필수 표기다`));
    if (!g.name) problems.push(problem('group-no-name', `${g.id} 에 name 이 없다`));
  }

  // ---- 상시시험 -------------------------------------------------------

  for (const g of groups) {
    if (g.cadence !== 'rolling') continue;
    if (!g.rollingRule) {
      problems.push(problem('rolling-no-rule', `${g.id} 이 rolling 인데 rollingRule 이 없다 — 카드가 빈다`));
    }
    if (!g.ruleCheckedAt) {
      problems.push(problem('rolling-no-checked-at',
        `${g.id} 에 ruleCheckedAt 이 없다 — 규칙이 낡아도 아무도 모른다`));
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(g.ruleCheckedAt)) {
      problems.push(problem('bad-checked-at', `${g.id}.ruleCheckedAt 이 YYYY-MM-DD 가 아니다: ${g.ruleCheckedAt}`));
    }
  }

  for (const e of exams) {
    const g = byId.get(e.groupId);
    if (!g) continue;
    const groupRolling = g.cadence === 'rolling';
    if (Boolean(e.rolling) !== groupRolling) {
      problems.push(problem('rolling-mismatch',
        `${e.slug}.rolling=${Boolean(e.rolling)} 인데 ${g.id}.cadence=${g.cadence} 다`));
    }
  }

  // ---- robots 경계 -----------------------------------------------------
  //
  // 규칙 3. 자동 수집 대상만 sourceUrl, 링크 전용은 agencyUrl — 필드 이름으로 구분을
  // 강제한다. sourceUrl 이 collect:'crawl' 밖에 붙어 있으면 그 구분이 무너진 것이다.

  for (const g of groups) {
    if (g.sourceUrl && g.collect !== 'crawl') {
      problems.push(problem('source-url-outside-crawl',
        `${g.id} 은 collect='${g.collect}' 인데 sourceUrl 이 있다 — 금지 사이트가 수집 대상에 섞이는 경로다`));
    }
    if (g.collect === 'crawl' && !g.sourceUrl) {
      problems.push(problem('crawl-no-source', `${g.id} 은 collect='crawl' 인데 sourceUrl 이 없다`));
    }
    for (const [field, url] of [['sourceUrl', g.sourceUrl], ['agencyUrl', g.agencyUrl], ['applyUrl', g.applyUrl]]) {
      if (url && !/^https?:\/\//.test(url)) {
        problems.push(problem('bad-url', `${g.id}.${field} 이 http(s) 로 시작하지 않는다: ${url}`));
      }
    }
  }

  return { ok: problems.length === 0, problems };
}

/** 사람이 읽는 요약 */
export function formatProblems(problems) {
  if (!problems.length) return '시드 무결성 이상 없음';
  const lines = [`시드 무결성 문제 ${problems.length}건:`];
  for (const p of problems) lines.push(`  [${p.code}] ${p.message}`);
  return lines.join('\n');
}
