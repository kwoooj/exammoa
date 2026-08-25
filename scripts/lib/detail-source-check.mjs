const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HTTPS = /^https:\/\//;
const SAFE_ID = /^[a-z0-9][a-z0-9-]*$/;

export const DETAIL_SOURCE_METHODS = new Set(['html', 'json', 'pdf', 'manual-upload']);
export const DETAIL_COLLECTION_STATES = new Set(['active', 'planned', 'blocked']);
export const DETAIL_COVERS = new Set([
  'classification', 'result', 'deliveryModes', 'formats', 'fees', 'tendency',
]);

const automatic = source => source?.method !== 'manual-upload';

/**
 * 상세정보 출처 레지스트리 계약과 종목 커버리지를 검사한다.
 *
 * 등록과 활성화를 구분한다. planned 출처는 "공식 URL을 찾았지만 파서는 아직 없다"는
 * 뜻이고, active만 주간 수집 대상이다. 이 차이가 없으면 미완성 파서가 운영 데이터를
 * 갱신하거나, 반대로 등록만 된 출처를 수집 완료로 오인한다.
 */
export function checkDetailSources(seed, knownExamSlugs = [], options = {}) {
  const problems = [];
  if (!Array.isArray(seed?.sources)) {
    return {
      ok: false,
      problems: ['sources 배열이 없다.'],
      coverage: { registered: [], active: [], activeAutomatic: [], activeManual: [], uncovered: [...knownExamSlugs] },
    };
  }

  const known = new Set(knownExamSlugs);
  const adapters = new Set(options.knownAdapters ?? []);
  const sourceIds = new Set();
  const registered = new Set();
  const active = new Set();
  const activeAutomatic = new Set();
  const activeManual = new Set();

  for (const source of seed.sources) {
    const id = source?.id ?? '(없음)';
    if (!source?.id || sourceIds.has(source.id)) problems.push(`중복되거나 빈 source id: ${id}`);
    if (source?.id && !SAFE_ID.test(source.id)) problems.push(`${id}: source id는 영문 소문자·숫자·하이픈만 쓸 수 있다.`);
    sourceIds.add(source?.id);

    if (!source?.name || !source?.authority) problems.push(`${id}: 이름 또는 시행기관이 비었다.`);
    if (!DETAIL_SOURCE_METHODS.has(source?.method)) problems.push(`${id}: method가 올바르지 않다.`);
    if (!DETAIL_COLLECTION_STATES.has(source?.collectionStatus)) problems.push(`${id}: collectionStatus가 올바르지 않다.`);
    if (!source?.adapter) problems.push(`${id}: adapter가 비었다.`);
    if (source?.collectionStatus === 'active' && adapters.size && !adapters.has(source.adapter)) {
      problems.push(`${id}: 활성 출처 adapter(${source.adapter})가 구현되지 않았다.`);
    }
    if (!Number.isInteger(source?.cadenceDays) || source.cadenceDays < 1) problems.push(`${id}: cadenceDays가 올바르지 않다.`);
    if (source?.reviewMode !== 'draft-pr') problems.push(`${id}: reviewMode는 draft-pr이어야 한다.`);

    const url = source?.sourceUrl ?? source?.urlTemplate;
    if (!HTTPS.test(url ?? '')) problems.push(`${id}: 공식 HTTPS 출처가 없다.`);
    if (source?.urlTemplate && !source.urlTemplate.includes('{')) problems.push(`${id}: urlTemplate에 치환 토큰이 없다.`);

    if (!Array.isArray(source?.covers) || !source.covers.length) {
      problems.push(`${id}: covers가 비었다.`);
    } else {
      for (const field of source.covers) if (!DETAIL_COVERS.has(field)) problems.push(`${id}: 알 수 없는 covers 값 ${field}`);
    }

    if (!Array.isArray(source?.examSlugs) || !source.examSlugs.length) {
      problems.push(`${id}: examSlugs가 비었다.`);
    } else {
      const seen = new Set();
      for (const slug of source.examSlugs) {
        if (seen.has(slug)) problems.push(`${id}: 중복 종목 ${slug}`);
        seen.add(slug);
        if (!known.has(slug)) problems.push(`${id}: 시험 시드에 없는 종목 ${slug}`);
        registered.add(slug);
        if (source.collectionStatus === 'active') {
          active.add(slug);
          if (automatic(source)) activeAutomatic.add(slug);
          else activeManual.add(slug);
        }
      }
    }

    const robots = source?.robots;
    if (!robots || !['allowed', 'blocked', 'not-applicable'].includes(robots.status)) {
      problems.push(`${id}: robots 판정이 없다.`);
    } else {
      if (!ISO_DATE.test(robots.checkedAt ?? '')) problems.push(`${id}: robots 확인일이 올바르지 않다.`);
      if (automatic(source) && robots.status === 'not-applicable') problems.push(`${id}: 자동 출처에 not-applicable robots 판정을 쓸 수 없다.`);
      if (source.collectionStatus === 'active' && automatic(source) && robots.status !== 'allowed') {
        problems.push(`${id}: robots가 허용되지 않은 자동 출처를 활성화했다.`);
      }
      if (robots.url && !HTTPS.test(robots.url)) problems.push(`${id}: robots URL이 HTTPS가 아니다.`);
    }
  }

  const uncovered = knownExamSlugs.filter(slug => !registered.has(slug));
  if (options.requireAllRegistered && uncovered.length) {
    problems.push(`공식 상세 출처가 등록되지 않은 시험 ${uncovered.length}개: ${uncovered.join(', ')}`);
  }

  return {
    ok: problems.length === 0,
    problems,
    coverage: {
      registered: knownExamSlugs.filter(slug => registered.has(slug)),
      active: knownExamSlugs.filter(slug => active.has(slug)),
      activeAutomatic: knownExamSlugs.filter(slug => activeAutomatic.has(slug)),
      activeManual: knownExamSlugs.filter(slug => activeManual.has(slug)),
      uncovered,
    },
  };
}
