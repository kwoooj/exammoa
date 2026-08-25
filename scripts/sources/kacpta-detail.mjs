import { readTables, tableByHeader } from '../lib/html.mjs';

const compact = value => String(value ?? '').replace(/\s+/g, '');
const canonical = value => String(value ?? '').replace(/[^0-9A-Za-z가-힣%]/g, '');
const textOf = html => String(html ?? '')
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&middot;|&#183;/gi, '·')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>');

const section = (name, mode, maxScore, extra = {}) => ({
  name,
  mode,
  ...(maxScore ? { scoreRange: { min: 0, max: maxScore } } : {}),
  ...extra,
});

const computer = ({ slug, durationMinutes, theory, practical }) => ({
  slug,
  family: 'computer',
  durationMinutes,
  classification: { kind: 'private-accredited', label: '국가공인 민간자격' },
  result: { label: '100점 만점 70점 이상', passCriteria: '이론·실무 합계 100점 만점에 70점 이상' },
  deliveryModes: ['이론 객관식 4지선다형', '실무 전산세무회계프로그램 작업'],
  sections: [
    ...theory.map(([name, score]) => section(`이론 · ${name}`, 'multiple-choice', score)),
    ...practical.map(([name, score]) => section(`실무 · ${name}`, 'computer-task', score)),
  ],
  summary: `이론 30점 · 실무 70점 · ${durationMinutes}분`,
  stageName: '이론·실무 통합 시험',
  stageNote: '이론과 실무를 한 제한시간 안에 통합 시행하며, 영역별 제한시간은 공식 안내에 없습니다.',
  formatFingerprints: [...theory, ...practical].map(([name, score]) => `${name}(${score}%)`),
});

const written = ({ slug, family, durationMinutes, part1, part2, count, mixed = false, breakdown, passCriteria, label, classification }) => ({
  slug,
  family,
  durationMinutes,
  totalItemCount: count * 2,
  classification,
  result: { label, passCriteria },
  deliveryModes: [mixed ? `객관식·${breakdown.includes('약술형') ? '주관식·약술형' : '주관식'} 혼합 필기` : '객관식 필기'],
  sections: [
    section(part1, mixed ? 'mixed' : 'multiple-choice', null, {
      itemCount: count,
      ...(mixed ? { note: breakdown } : {}),
    }),
    section(part2, mixed ? 'mixed' : 'multiple-choice', null, {
      itemCount: count,
      ...(mixed ? { note: breakdown } : {}),
    }),
  ],
  summary: `${count * 2}문항 · ${durationMinutes}분`,
  stageName: '통합 필기시험',
  stageNote: '1부와 2부를 한 제한시간 안에 통합 시행하며, 과목별 제한시간은 공식 안내에 없습니다.',
  formatFingerprints: mixed
    ? [breakdown]
    : [`각각 객관식 ${count}문항`],
});

const ACCREDITED = { kind: 'private-accredited', label: '국가공인 민간자격' };
const REGISTERED = { kind: 'private-registered', label: '등록민간자격' };

const SPECS = [
  computer({ slug: '전산세무1급', durationMinutes: 90,
    theory: [['재무회계', 10], ['원가회계', 10], ['세무회계', 10]],
    practical: [['재무회계 및 원가회계', 15], ['부가가치세', 15], ['원천제세', 10], ['법인세무조정', 30]] }),
  computer({ slug: '전산세무2급', durationMinutes: 90,
    theory: [['재무회계', 10], ['원가회계', 10], ['세무회계', 10]],
    practical: [['재무회계 및 원가회계', 35], ['부가가치세', 20], ['원천제세', 15]] }),
  computer({ slug: '전산회계1급', durationMinutes: 60,
    theory: [['회계원리', 15], ['원가회계', 10], ['세무회계', 5]],
    practical: [['기초정보의 등록·수정', 15], ['거래자료의 입력', 30], ['부가가치세', 15], ['입력자료 및 제장부 조회', 10]] }),
  computer({ slug: '전산회계2급', durationMinutes: 60,
    theory: [['회계원리', 30]],
    practical: [['기초정보의 등록·수정', 20], ['거래자료의 입력', 40], ['입력자료 및 제장부 조회', 10]] }),
  written({ slug: '세무회계1급', family: 'tax', durationMinutes: 100, count: 22, mixed: true, breakdown: '객관식 15문항 · 주관식 5문항 · 약술형 2문항',
    part1: '세법 1부 · 법인세법·부가가치세법·조세특례제한법',
    part2: '세법 2부 · 국세기본법·소득세법·조세특례제한법', classification: ACCREDITED,
    label: '1·2부 과락 적용 평균 합격제', passCriteria: '세법 1부·2부 각각 40점 이상이면서 합산평균 60점 이상' }),
  written({ slug: '세무회계2급', family: 'tax', durationMinutes: 80, count: 25,
    part1: '세법 1부 · 법인세법·부가가치세법', part2: '세법 2부 · 국세기본법·소득세법', classification: ACCREDITED,
    label: '1·2부 과락 적용 평균 합격제', passCriteria: '세법 1부·2부 각각 40점 이상이면서 합산평균 60점 이상' }),
  written({ slug: '세무회계3급', family: 'tax', durationMinutes: 60, count: 20,
    part1: '세법 1부 · 법인세법·부가가치세법', part2: '세법 2부 · 소득세법', classification: ACCREDITED,
    label: '1·2부 과락 적용 평균 합격제', passCriteria: '세법 1부·2부 각각 40점 이상이면서 합산평균 60점 이상' }),
  written({ slug: '기업회계1급', family: 'corporate', durationMinutes: 100, count: 25, mixed: true, breakdown: '객관식 20문항 · 주관식 5문항',
    part1: '1부 · 재무회계', part2: '2부 · 원가관리회계', classification: REGISTERED,
    label: '1·2부 평균 합격제', passCriteria: '1부·2부 합산평균 70점 이상' }),
  written({ slug: '기업회계2급', family: 'corporate', durationMinutes: 80, count: 25,
    part1: '1부 · 재무회계', part2: '2부 · 원가회계', classification: REGISTERED,
    label: '1·2부 평균 합격제', passCriteria: '1부·2부 합산평균 70점 이상' }),
  written({ slug: '기업회계3급', family: 'corporate', durationMinutes: 60, count: 20,
    part1: '1부 · 회계원리', part2: '2부 · 회계원리', classification: REGISTERED,
    label: '70점 이상 합격제', passCriteria: '100점 만점에 70점 이상' }),
];

const SPEC_BY_SLUG = new Map(SPECS.map(spec => [spec.slug, spec]));
const FAMILY = {
  computer: {
    path: 'info_outline.aspx', names: ['전산세무', '전산회계'], fee: '30,000원', kind: '공인민간자격',
    fingerprints: ['이론시험객관식4지선다형', '실무시험전산세무회계프로그램을이용한실기시험', '법인세무조정(30%)', '거래자료의입력(40%)'],
  },
  tax: {
    path: 'info_outline2.aspx', names: ['세무회계'], fee: '25,000원', kind: '공인민간자격',
    fingerprints: ['객관식15문항주관식5문항약술형2문항', '세법1부·2부각각객관식25문항', '세법1부·2부각각객관식20문항'],
  },
  corporate: {
    path: 'info_outline3.aspx', names: ['기업회계'], fee: '25,000원', kind: '등록민간자격',
    fingerprints: ['1부·2부각각객관식20문항주관식5문항', '1부·2부각각객관식25문항', '1부·2부각각객관식20문항'],
  },
};

const familyOfName = value => {
  const name = compact(value);
  if (name.includes('전산세무')) return '전산세무';
  if (name.includes('전산회계')) return '전산회계';
  if (name.includes('세무회계')) return '세무회계';
  if (name.includes('기업회계')) return '기업회계';
  return null;
};

function discoverSlugs(html) {
  const picked = tableByHeader(readTables(html), ['종목 및 등급', '시험구성', '비고']);
  if (!picked) throw new Error('종목·등급 시험구성 표를 찾지 못했다.');
  const discovered = [];
  for (const row of picked.table.grid.slice(picked.headerRow + 1)) {
    const cells = row.map(cell => compact(cell.text)).filter(Boolean);
    const family = cells.map(familyOfName).find(Boolean);
    const grade = cells.map(value => value.match(/([1-9])급/)?.[1]).find(Boolean);
    if (family && grade) discovered.push(`${family}${grade}급`);
  }
  return [...new Set(discovered)];
}

function detailOf(spec, source, page, checkedAt) {
  const stage = {
    id: 'single',
    name: spec.stageName,
    durationMinutes: spec.durationMinutes,
    ...(spec.totalItemCount ? { totalItemCount: spec.totalItemCount } : {}),
    totalScore: 100,
    sections: spec.sections,
    note: spec.stageNote,
  };
  return {
    examSlug: spec.slug,
    catalogStatus: 'published',
    sourceRefs: [source.id],
    classification: {
      ...spec.classification,
      authority: source.authority,
      sourceUrl: page.url,
      checkedAt,
    },
    result: { type: 'pass-fail', ...spec.result },
    deliveryModes: spec.deliveryModes,
    formats: [{
      checkedAt,
      sourceUrl: page.url,
      totalDurationMinutes: spec.durationMinutes,
      summary: spec.summary,
      stages: [stage],
      note: '실제 시작시각과 입실 마감은 회차별 수험표를 확인해야 합니다.',
    }],
  };
}

function validateFormatSegments(body, family, html) {
  const heading = canonical('종목및등급 시험 방법 시험과목 평가범위 요약 평가비율 제한시간 출제방법');
  const start = body.indexOf(heading);
  if (start < 0) throw new Error('시험방법·제한시간 구성표를 찾지 못했다.');
  const formatBody = body.slice(start);
  const familySpecs = SPECS.filter(spec => spec.family === family);
  for (let index = 0; index < familySpecs.length; index += 1) {
    const spec = familySpecs[index];
    const at = formatBody.indexOf(canonical(spec.slug));
    if (at < 0) throw new Error(`${spec.slug}: 공식 구성 행을 찾지 못했다.`);
    const nextCandidates = familySpecs.slice(index + 1)
      .map(candidate => formatBody.indexOf(canonical(candidate.slug), at + 1))
      .filter(candidate => candidate >= 0);
    const end = nextCandidates.length ? Math.min(...nextCandidates) : formatBody.length;
    const segment = formatBody.slice(at, end);
    const expected = [`${spec.durationMinutes}분`, ...(family === 'computer' ? [] : spec.formatFingerprints)];
    const absent = expected.filter(value => !segment.includes(canonical(value)));
    if (absent.length) throw new Error(`${spec.slug}: 공식 시간·구성 지문 불일치 (${absent.join(', ')})`);
  }
  if (family === 'computer') {
    const evaluationTables = readTables(html).filter(table => tableByHeader([table], ['구분', '평가범위', '세부내용']));
    if (evaluationTables.length !== familySpecs.length) {
      throw new Error(`전산세무회계 평가범위 표가 ${evaluationTables.length}개다 (예상 ${familySpecs.length}개).`);
    }
    familySpecs.forEach((spec, index) => {
      const tableBody = canonical(evaluationTables[index].grid.flat().map(cell => cell.text).join(' '));
      const absent = spec.formatFingerprints.filter(value => !tableBody.includes(canonical(value)));
      if (absent.length) throw new Error(`${spec.slug}: 공식 배점 지문 불일치 (${absent.join(', ')})`);
    });
  }
}

export function parseKacptaDetailBundle(raw, { source, observedAt }) {
  const bundle = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const pages = Array.isArray(bundle?.pages) ? bundle.pages : [];
  const pagesByFamily = new Map();
  const failures = [];
  const unclassified = [];
  const discovered = [];
  for (const page of pages) {
    if (!FAMILY[page?.family]) {
      unclassified.push(page?.family ?? '(분류 없음)');
      continue;
    }
    if (pagesByFamily.has(page.family)) {
      failures.push(`${page.family}: 공식 시험개요 원문이 중복됐다.`);
      continue;
    }
    pagesByFamily.set(page.family, page);
  }

  const validFamilies = new Set();
  for (const [family, config] of Object.entries(FAMILY)) {
    const page = pagesByFamily.get(family);
    if (!page) {
      failures.push(`${family}: 공식 시험개요 원문이 없다.`);
      continue;
    }
    try {
      const pageSlugs = discoverSlugs(page.html);
      discovered.push(...pageSlugs);
      const body = canonical(textOf(page.html));
      const fingerprints = [`자격의종류:${config.kind}`, `접수수수료${config.fee}`, ...config.fingerprints];
      const absent = fingerprints.filter(value => !body.includes(canonical(value)));
      if (absent.length) throw new Error(`공식 구성·응시료 지문 불일치: ${absent.join(', ')}`);
      const expected = SPECS.filter(spec => spec.family === family).map(spec => spec.slug);
      if (JSON.stringify(pageSlugs.sort()) !== JSON.stringify(expected.sort())) {
        throw new Error(`공식 종목 전수 불일치: ${pageSlugs.join(', ') || '없음'}`);
      }
      validateFormatSegments(body, family, page.html);
      validFamilies.add(family);
    } catch (error) {
      failures.push(`${family}: ${error?.message ?? error}`);
    }
  }

  const checkedAt = observedAt.slice(0, 10);
  const details = discovered.flatMap(slug => {
    const spec = SPEC_BY_SLUG.get(slug);
    if (!spec) {
      unclassified.push(slug);
      return [];
    }
    if (!validFamilies.has(spec.family) || !source.examSlugs.includes(slug)) return [];
    return [detailOf(spec, source, pagesByFamily.get(spec.family), checkedAt)];
  });
  const included = new Set(details.map(detail => detail.examSlug));
  return {
    details,
    diagnostics: {
      discovered: discovered.length,
      included: details.length,
      missing: source.examSlugs.filter(slug => !included.has(slug)),
      unclassified: [...new Set(unclassified)],
      failures,
    },
  };
}

export async function collectKacptaDetails({ source, fetchDetailUrl, robotsCache }) {
  const base = new URL(source.sourceUrl);
  const pages = [];
  for (const [family, config] of Object.entries(FAMILY)) {
    const url = new URL(config.path, base).href;
    const html = await fetchDetailUrl(source, url, fetch, robotsCache);
    pages.push({ family, url, html });
  }
  const bundle = { pages };
  return { raw: bundle, parseInput: bundle };
}

export { FAMILY as KACPTA_DETAIL_FAMILIES, SPECS as KACPTA_DETAIL_SPECS };
