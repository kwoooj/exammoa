import { readTables } from '../lib/html.mjs';

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

const SUBJECTS = ['아래한글', '한셀', '한쇼', 'MS워드', '한글엑셀', '한글액세스', '한글파워포인트', '인터넷'];
const FINGERPRINTS = [
  '등록번호 : 2008-0191',
  '자격종류 : 공인민간자격',
  'ITQ정보기술자격',
  'A등급 B등급 C등급 PBT 60분',
  'A등급 400점 ~ 500점',
  'B등급 300점 ~ 399점',
  'C등급 200점 ~ 299점',
  '500점 만점이며 200점 미만은 불합격',
  '일반접수 22,000원 42,000원 60,000원',
];

function discoverSubjects(html) {
  const table = readTables(html).find(candidate => {
    const body = canonical(candidate.grid.flat().map(cell => cell.text).join(' '));
    return body.includes(canonical('자격종목(과목)'))
      && body.includes(canonical('시험방식'))
      && body.includes(canonical('시험시간'));
  });
  if (!table) throw new Error('ITQ 시험과목 구성표를 찾지 못했다.');
  const found = [...new Set(table.grid.flat().map(cell => cell.text.trim()).filter(value => SUBJECTS.includes(value)))];
  const extra = table.grid.flat().map(cell => cell.text.trim())
    .filter(value => value && !SUBJECTS.includes(value) && /^(?:MS|한글|한셀|한쇼|아래한글|인터넷)/.test(value))
    .filter(value => !['한글과컴퓨터', '한컴오피스', 'MS오피스'].includes(value));
  return { found, extra: [...new Set(extra)] };
}

export function parseKpcItqDetail(html, { source, observedAt }) {
  const failures = [];
  const unclassified = [];
  let subjects = [];
  try {
    const discovered = discoverSubjects(html);
    subjects = discovered.found;
    unclassified.push(...discovered.extra);
    if (JSON.stringify(subjects) !== JSON.stringify(SUBJECTS)) {
      throw new Error(`공식 과목 전수 불일치 (${subjects.join(', ') || '없음'})`);
    }
    const body = canonical(textOf(html));
    const absent = FINGERPRINTS.filter(value => !body.includes(canonical(value)));
    if (absent.length) throw new Error(`공식 구성·등급·응시료 지문 불일치 (${absent.join(', ')})`);
  } catch (error) {
    failures.push(error?.message ?? String(error));
  }

  const checkedAt = observedAt.slice(0, 10);
  const ok = failures.length === 0 && unclassified.length === 0;
  const details = ok ? [{
    examSlug: 'ITQ',
    catalogStatus: 'published',
    sourceRefs: [source.id],
    classification: {
      kind: 'private-accredited',
      label: '국가공인 민간자격',
      authority: source.authority,
      sourceUrl: source.sourceUrl,
      checkedAt,
      note: '등록번호 2008-0191, 과학기술정보통신부 공인 A·B·C급',
    },
    result: {
      type: 'level-awarded',
      label: '과목별 A·B·C 등급제',
      passCriteria: 'A등급 400~500점 · B등급 300~399점 · C등급 200~299점 · 200점 미만 불합격',
      note: '낮은 등급 취득 후 같은 과목에 다시 응시해 상위 등급으로 갱신할 수 있습니다.',
    },
    deliveryModes: ['PBT 기반 컴퓨터 실기 작업형'],
    formats: [{
      checkedAt,
      sourceUrl: source.sourceUrl,
      totalDurationMinutes: 60,
      summary: '선택 과목당 60분·500점 · 같은 회차 최대 3과목',
      stages: [{
        id: 'selected-subject',
        name: '선택 과목 시험',
        durationMinutes: 60,
        totalScore: 500,
        sections: SUBJECTS.map(name => ({ name, mode: 'computer-task' })),
        note: '표시된 8과목 중 선택한 한 과목 기준입니다. 한 회차에 최대 3과목까지 서로 다른 교시에 응시할 수 있습니다.',
      }],
      note: '정기시험은 09:00·10:30·12:00 교시로 운영되며 시험일정에 따라 달라질 수 있습니다.',
    }],
  }] : [];

  return {
    details,
    diagnostics: {
      discovered: subjects.length ? 1 : 0,
      included: details.length,
      missing: details.length ? [] : source.examSlugs,
      unclassified: [...new Set(unclassified)],
      failures,
    },
  };
}

export { FINGERPRINTS as KPC_ITQ_DETAIL_FINGERPRINTS, SUBJECTS as KPC_ITQ_SUBJECTS };
