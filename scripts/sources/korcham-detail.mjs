import { readTables, tableByHeader } from '../lib/html.mjs';

const compact = value => String(value ?? '').replace(/\s+/g, '');
const canonical = value => String(value ?? '').replace(/[^0-9A-Za-z가-힣%]/g, '');
const textOf = html => String(html ?? '')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&middot;|&#183;/gi, '·')
  .replace(/&amp;/gi, '&');

const nationalTechnical = {
  kind: 'national-technical',
  label: '국가기술자격',
};

const section = (name, mode, score = null) => ({
  name,
  mode,
  ...(score ? { scoreRange: { min: 0, max: score } } : {}),
});

const SPECS = [
  {
    slug: '컴퓨터활용능력1급',
    page: 'computer',
    classification: nationalTechnical,
    result: {
      label: '필기·실기 합격제',
      passCriteria: '필기: 과목당 40점 이상이면서 전과목 평균 60점 이상 · 실기: 스프레드시트 실무와 데이터베이스 실무 모두 70점 이상',
    },
    deliveryModes: ['필기 객관식', '실기 컴퓨터 작업형'],
    summary: '필기 60문항·60분 · 실기 2과목·90분',
    stages: [
      {
        id: 'written', name: '필기시험', durationMinutes: 60, totalItemCount: 60,
        sections: [
          section('컴퓨터 일반', 'multiple-choice', 100),
          section('스프레드시트 일반', 'multiple-choice', 100),
          section('데이터베이스 일반', 'multiple-choice', 100),
        ],
        note: '객관식 60문항을 60분 안에 통합 시행하며, 과목별 문항 배분은 공식 안내에 별도 공개되지 않습니다.',
      },
      {
        id: 'practical', name: '실기시험', durationMinutes: 90,
        sections: [
          section('스프레드시트 실무', 'computer-task', 100),
          section('데이터베이스 실무', 'computer-task', 100),
        ],
        timedBlocks: [
          { name: '스프레드시트 실무', durationMinutes: 45, sectionNames: ['스프레드시트 실무'] },
          { name: '데이터베이스 실무', durationMinutes: 45, sectionNames: ['데이터베이스 실무'] },
        ],
        note: '공식 안내가 두 실기 과목을 각각 45분으로 구분합니다.',
      },
    ],
    fingerprints: [
      '1급 필기시험 컴퓨터 일반 스프레드시트 일반 데이터베이스 일반 객관식 60문항 60분',
      '실기시험 스프레드시트 실무 데이터베이스 실무 컴퓨터 작업형 90분 (과목별 45분)',
      '실기 : 100점 만점에 70점 이상(1급은 두과목 모두 70점 이상)',
      '필기 : 20,500원', '실기 : 25,000원',
    ],
  },
  {
    slug: '컴퓨터활용능력2급',
    page: 'computer',
    classification: nationalTechnical,
    result: {
      label: '필기·실기 합격제',
      passCriteria: '필기: 과목당 40점 이상이면서 전과목 평균 60점 이상 · 실기: 100점 만점에 70점 이상',
    },
    deliveryModes: ['필기 객관식', '실기 컴퓨터 작업형'],
    summary: '필기 40문항·40분 · 실기 40분',
    stages: [
      {
        id: 'written', name: '필기시험', durationMinutes: 40, totalItemCount: 40,
        sections: [
          section('컴퓨터 일반', 'multiple-choice', 100),
          section('스프레드시트 일반', 'multiple-choice', 100),
        ],
        note: '객관식 40문항을 40분 안에 통합 시행하며, 과목별 문항 배분은 공식 안내에 별도 공개되지 않습니다.',
      },
      {
        id: 'practical', name: '실기시험', durationMinutes: 40, totalScore: 100,
        sections: [section('스프레드시트 실무', 'computer-task')],
        note: '컴퓨터 작업형 단일 과목입니다.',
      },
    ],
    fingerprints: [
      '2급 필기시험 컴퓨터 일반 스프레드시트 일반 객관식 40문항 40분',
      '실기시험 스프레드시트 실무 컴퓨터 작업형 40분',
      '필기 : 20,500원', '실기 : 25,000원',
    ],
  },
  {
    slug: '워드프로세서',
    page: 'word',
    classification: nationalTechnical,
    result: {
      label: '필기·실기 합격제',
      passCriteria: '필기: 과목당 40점 이상이면서 전과목 평균 60점 이상 · 실기: 100점 만점에 80점 이상',
    },
    deliveryModes: ['필기 객관식', '실기 컴퓨터 작업형'],
    summary: '필기 60문항·60분 · 실기 30분',
    stages: [
      {
        id: 'written', name: '필기시험', durationMinutes: 60, totalItemCount: 60,
        sections: [
          section('워드프로세싱 용어 및 기능', 'multiple-choice', 100),
          section('PC 운영체제', 'multiple-choice', 100),
          section('PC 기본상식', 'multiple-choice', 100),
        ],
        note: '객관식 60문항을 60분 안에 통합 시행하며, 과목별 문항 배분은 공식 안내에 별도 공개되지 않습니다.',
      },
      {
        id: 'practical', name: '실기시험', durationMinutes: 30, totalScore: 100,
        sections: [section('문서편집 기능', 'computer-task')],
        note: '컴퓨터 작업형 단일 과목입니다.',
      },
    ],
    fingerprints: [
      '단일등급 (구 1급) 필기시험 워드프로세싱 용어 및 기능 PC 운영체제 PC 기본상식 객관식 60문항 60분',
      '실기시험 문서편집 기능 컴퓨터 작업형 30분',
      '실기 : 100점 만점에 80점 이상',
      '필기 : 19,000원', '실기 : 22,000원',
    ],
  },
];

const SPEC_BY_SLUG = new Map(SPECS.map(spec => [spec.slug, spec]));
const PAGES = {
  computer: 'https://license.korcham.net/co/examguide.do?cd=0103&mm=21',
  word: 'https://license.korcham.net/co/examguide.do?cd=0102&mm=22',
};

function discovery(page, html) {
  const picked = tableByHeader(readTables(html), ['등급', '시험방법', '시험과목', '출제형태', '시험시간']);
  if (!picked) throw new Error(`${page}: 시험과목 구성표를 찾지 못했다.`);
  const grades = [...new Set(picked.table.grid.slice(picked.headerRow + 1)
    .map(row => compact(row[picked.col['등급']]?.text))
    .filter(Boolean))];
  if (page === 'computer') {
    return grades.map(grade => grade === '1급' ? '컴퓨터활용능력1급' : grade === '2급' ? '컴퓨터활용능력2급' : `컴퓨터활용능력${grade}`);
  }
  return grades.map(grade => grade.startsWith('단일등급') ? '워드프로세서' : `워드프로세서${grade}`);
}

function detailOf(spec, source, page, checkedAt) {
  const totalDurationMinutes = spec.stages.reduce((sum, stage) => sum + stage.durationMinutes, 0);
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
      totalDurationMinutes,
      summary: spec.summary,
      stages: spec.stages,
      note: '필기와 실기는 별도 시험입니다. 실제 시작시각은 시험장별 수험표를 확인해야 합니다.',
    }],
  };
}

export function parseKorchamDetailBundle(raw, { source, observedAt }) {
  const bundle = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const pages = Array.isArray(bundle?.pages) ? bundle.pages : [];
  const pageMap = new Map();
  const failures = [];
  const discovered = [];
  const unclassified = [];
  const validPages = new Set();

  for (const page of pages) {
    if (!PAGES[page?.page]) {
      unclassified.push(page?.page ?? '(분류 없음)');
      continue;
    }
    if (pageMap.has(page.page)) {
      failures.push(`${page.page}: 공식 시험안내 원문이 중복됐다.`);
      continue;
    }
    pageMap.set(page.page, page);
  }

  for (const pageName of Object.keys(PAGES)) {
    const page = pageMap.get(pageName);
    if (!page) {
      failures.push(`${pageName}: 공식 시험안내 원문이 없다.`);
      continue;
    }
    try {
      const pageSlugs = discovery(pageName, page.html);
      discovered.push(...pageSlugs);
      for (const slug of pageSlugs) if (!SPEC_BY_SLUG.has(slug)) unclassified.push(slug);
      const body = canonical(textOf(page.html));
      for (const spec of SPECS.filter(candidate => candidate.page === pageName)) {
        const absent = spec.fingerprints.filter(value => !body.includes(canonical(value)));
        if (absent.length) throw new Error(`${spec.slug}: 공식 구성·응시료 지문 불일치 (${absent.join(', ')})`);
      }
      validPages.add(pageName);
    } catch (error) {
      failures.push(`${pageName}: ${error?.message ?? error}`);
    }
  }

  const checkedAt = observedAt.slice(0, 10);
  const details = SPECS.flatMap(spec => {
    const page = pageMap.get(spec.page);
    if (!validPages.has(spec.page) || !page || !source.examSlugs.includes(spec.slug)) return [];
    return [detailOf(spec, source, page, checkedAt)];
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

export async function collectKorchamDetails({ source, fetchDetailUrl, robotsCache }) {
  const pages = [];
  for (const [page, url] of Object.entries(PAGES)) {
    const html = await fetchDetailUrl(source, url, fetch, robotsCache);
    pages.push({ page, url, html });
  }
  const bundle = { pages };
  return { raw: bundle, parseInput: bundle };
}

export { PAGES as KORCHAM_DETAIL_PAGES, SPECS as KORCHAM_DETAIL_SPECS };
