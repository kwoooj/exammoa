const canonical = value => String(value ?? '')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/[^0-9A-Za-z가-힣]/g, '');

const CONFIGS = {
  'history-exam-detail': {
    slug: '한국사능력검정시험',
    pages: {
      guideline: 'https://www.historyexam.go.kr/pageLink.do?link=examGuideline',
      application: 'https://www.historyexam.go.kr/pageLink.do?link=apyexmInfo',
    },
    fingerprints: {
      guideline: [
        '1급(80점 이상)', '3급(60~69점)', '4급(80점 이상)', '6급(60~69점)',
        '50문항(5지 택1형)', '50문항(4지 택1형)', '100점만점(문항별 1점~3점 차등배점)',
      ],
      application: [
        '10:30~11:50 시험 실시 (50문항) 80분',
        '10:30~11:40 시험 실시 (50문항) 70분',
        '27,000원', '22,000원',
      ],
    },
    detail({ source, checkedAt }) {
      const sourceUrl = this.pages.guideline;
      return {
        examSlug: this.slug,
        catalogStatus: 'published',
        sourceRefs: [source.id],
        classification: {
          kind: 'institutional-assessment',
          label: '국가 시행 능력검정',
          authority: source.authority,
          sourceUrl,
          checkedAt,
          note: '국사편찬위원회가 시행하는 한국사 능력검정시험입니다.',
        },
        result: {
          type: 'level-awarded',
          label: '심화 1~3급·기본 4~6급 인증',
          passCriteria: '심화: 80점 이상 1급·70~79점 2급·60~69점 3급 · 기본: 80점 이상 4급·70~79점 5급·60~69점 6급',
        },
        deliveryModes: ['심화 5지선다 객관식', '기본 4지선다 객관식'],
        formats: [{
          checkedAt,
          sourceUrl,
          totalDurationMinutes: { min: 70, max: 80 },
          summary: '심화 50문항·80분 · 기본 50문항·70분',
          stages: [{
            id: 'selected-level',
            name: '선택 유형 시험',
            durationMinutes: { min: 70, max: 80 },
            totalItemCount: 50,
            totalScore: 100,
            sections: [{ name: '한국사(심화 또는 기본)', mode: 'multiple-choice' }],
            note: '심화와 기본 중 하나를 선택합니다. 과목별 제한시간 없이 50문항 전체를 심화 80분 또는 기본 70분 안에 풉니다.',
          }],
          note: '시험 시작은 10:30이며, 오리엔테이션·신분 확인·문제지 배부는 시험시간에 포함하지 않습니다.',
        }],
      };
    },
  },
  'kbs-korean-detail': {
    slug: 'KBS한국어능력시험',
    pages: {
      process: 'https://www.kbskorean.org/klt/helper/exam-process',
      scope: 'https://www.kbskorean.org/klt/exam-info/exam-scope',
      grading: 'https://www.kbskorean.org/klt/exam-info/grading-guide',
      criteria: 'https://www.kbskorean.org/klt/helper/exam-criteria',
    },
    fingerprints: {
      process: ['10:00 ~ 12:00 (쉬는 시간 없음)', '듣기·말하기 시험: 25분(15문항)', '지필 시험: 95분(85문항)'],
      scope: ['100문항 예상', '문항당 균일 배점이 원칙이나 필요시 차등 배점'],
      grading: ['국어능력시험 점수(990점 만점)', '1급', '2+급', '4-급', '무급'],
      criteria: ['성적 및 자격은 성적발표일로부터 2년간 유효'],
    },
    detail({ source, checkedAt }) {
      const sourceUrl = this.pages.process;
      return {
        examSlug: this.slug,
        catalogStatus: 'published',
        sourceRefs: [source.id],
        classification: {
          kind: 'private-accredited',
          label: '국가공인 민간자격',
          authority: source.authority,
          sourceUrl,
          checkedAt,
          note: '국가공인 KBS한국어능력시험이며 성적과 자격은 성적발표일로부터 2년간 유효합니다.',
        },
        result: {
          type: 'level-awarded',
          label: '10~990점·1급~4-급 등급제',
          passCriteria: '1급·2+급·2-급·3+급·3-급·4+급·4-급 또는 무급으로 판정',
          note: '매회 난이도와 문항 변별도를 반영하는 등급 부여 시스템을 사용하므로 고정 절대점수 경계가 아닙니다.',
        },
        deliveryModes: ['방송 듣기·말하기', '지필 객관식'],
        formats: [{
          checkedAt,
          sourceUrl,
          totalDurationMinutes: 120,
          summary: '100문항·120분(듣기·말하기 25분 + 지필 95분)',
          stages: [{
            id: 'regular',
            name: '정기시험',
            durationMinutes: 120,
            totalItemCount: 100,
            totalScore: 100,
            sections: [
              { name: '듣기·말하기', itemCount: 15, mode: 'multiple-choice' },
              { name: '지필 평가', itemCount: 85, mode: 'multiple-choice' },
            ],
            timedBlocks: [
              { name: '듣기·말하기', durationMinutes: 25, sectionNames: ['듣기·말하기'] },
              { name: '지필 평가', durationMinutes: 95, sectionNames: ['지필 평가'] },
            ],
            note: '원점수는 100점 기준이며 성적표에는 난이도를 보정한 10~990점 환산점수와 등급이 제공됩니다.',
          }],
          note: '10:00~12:00에 쉬는 시간 없이 시행합니다.',
        }],
      };
    },
  },
  'ybm-toeic-speaking-detail': {
    slug: '토익스피킹',
    pages: {
      introduction: 'https://www.toeicswt.co.kr/common/template/viewContents.php?contentsCode=72',
      levels: 'https://www.toeicswt.co.kr/common/template/viewContents.php?contentsCode=78',
      guide: 'https://www.toeicswt.co.kr/common/template/viewContents.php?contentsCode=86',
      regulation: 'https://www.toeicswt.co.kr/common/template/viewContents.php?contentsCode=87',
    },
    fingerprints: {
      introduction: [
        '11문항 / 약 20분', 'Questions 1-2', 'Read a text aloud', 'Questions 3-4',
        'Describe a picture', 'Questions 5-7', 'Questions 8-10', 'Question 11', 'Express an opinion',
      ],
      levels: ['Advanced High', '200', 'Advanced Mid', '180~190', 'Novice Mid / Low'],
      guide: ['TOEIC Speaking Test 84,000원(부가세 10% 포함)'],
      regulation: ['말하기 평가(Questions 1~11)', '약 20분', '시험 시작 전 기자재 점검 및 오리엔테이션', '추가로 약 30분'],
    },
    detail({ source, checkedAt }) {
      const sourceUrl = this.pages.introduction;
      return {
        examSlug: this.slug,
        catalogStatus: 'published',
        sourceRefs: [source.id],
        classification: {
          kind: 'international-assessment',
          label: '국제 공인 영어 말하기 평가',
          authority: source.authority,
          sourceUrl,
          checkedAt,
          note: 'ETS가 개발하고 한국TOEIC위원회가 국내 정기시험을 시행합니다.',
        },
        result: {
          type: 'score',
          label: '0~200점·ACTFL 등급',
          passCriteria: '합격·불합격 없이 0~200점과 Novice Mid/Low부터 Advanced High까지의 ACTFL 등급을 제공합니다.',
          note: '성적은 시험 시행일로부터 2년 뒤 해당 시험일자까지 유효합니다.',
        },
        deliveryModes: ['CBT 음성 녹음형'],
        formats: [{
          checkedAt,
          sourceUrl,
          totalDurationMinutes: 20,
          summary: '11문항·약 20분 · 컴퓨터 음성 녹음',
          stages: [{
            id: 'speaking',
            name: '말하기 평가',
            durationMinutes: 20,
            totalItemCount: 11,
            totalScore: 200,
            sections: [
              { name: '문장 읽기', itemCount: 2, mode: 'recorded-response', note: '각 문항 준비 45초·답변 45초' },
              { name: '사진 묘사', itemCount: 2, mode: 'recorded-response', note: '각 문항 준비 45초·답변 30초' },
              { name: '질문에 답하기', itemCount: 3, mode: 'recorded-response', note: '문항당 준비 3초·답변 15~30초' },
              { name: '제공 정보로 답하기', itemCount: 3, mode: 'recorded-response', note: '지문 읽기 45초, 문항당 준비 3초·답변 15~30초' },
              { name: '의견 제시', itemCount: 1, mode: 'recorded-response', note: '준비 45초·답변 60초' },
            ],
            note: '문항별 준비·응답 제한은 공식 화면 흐름에 따라 자동 진행되며, 전체 소요시간은 약 20분입니다.',
          }],
          note: '약 30분의 오리엔테이션·장비 점검·답변 확인 시간은 실제 말하기 평가시간에 포함하지 않습니다.',
        }],
      };
    },
  },
};

function configFor(source) {
  const config = CONFIGS[source?.id];
  if (!config) throw new Error(`지원하지 않는 기존 일정 상세 출처: ${source?.id ?? '(없음)'}`);
  if (source.examSlugs.length !== 1 || source.examSlugs[0] !== config.slug) {
    throw new Error(`${source.id}: 출처 종목이 예상값 ${config.slug}와 다르다.`);
  }
  return config;
}

export function parseExistingScheduleDetailBundle(raw, { source, observedAt }) {
  const config = configFor(source);
  const bundle = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const pages = Array.isArray(bundle?.pages) ? bundle.pages : [];
  const pageMap = new Map();
  const failures = [];
  const unclassified = [];

  for (const page of pages) {
    if (!config.pages[page?.page]) {
      unclassified.push(page?.page ?? '(분류 없음)');
      continue;
    }
    if (pageMap.has(page.page)) {
      failures.push(`${page.page}: 공식 상세 원문이 중복됐다.`);
      continue;
    }
    pageMap.set(page.page, page);
  }

  for (const [pageName, url] of Object.entries(config.pages)) {
    const page = pageMap.get(pageName);
    if (!page) {
      failures.push(`${pageName}: 공식 상세 원문이 없다.`);
      continue;
    }
    if (page.url !== url) failures.push(`${pageName}: 공식 URL이 바뀌었다 (${page.url ?? '없음'}).`);
    const body = canonical(page.html);
    const absent = config.fingerprints[pageName].filter(value => !body.includes(canonical(value)));
    if (absent.length) failures.push(`${pageName}: 공식 구성 지문 불일치 (${absent.join(', ')})`);
  }

  const ok = failures.length === 0 && unclassified.length === 0;
  const details = ok ? [config.detail({ source, checkedAt: observedAt.slice(0, 10) })] : [];
  return {
    details,
    diagnostics: {
      discovered: pages.length ? 1 : 0,
      included: details.length,
      missing: details.length ? [] : [...source.examSlugs],
      unclassified: [...new Set(unclassified)],
      failures,
    },
  };
}

export async function collectExistingScheduleDetails({ source, fetchDetailUrl, robotsCache }) {
  const config = configFor(source);
  const pages = [];
  for (const [page, url] of Object.entries(config.pages)) {
    const html = await fetchDetailUrl(source, url, fetch, robotsCache);
    pages.push({ page, url, html });
  }
  const bundle = { pages };
  return { raw: bundle, parseInput: bundle };
}

export { CONFIGS as EXISTING_SCHEDULE_DETAIL_CONFIGS };
