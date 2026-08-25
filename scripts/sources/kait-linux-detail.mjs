import { readTables, rowsAsObjects, tableByHeader } from '../lib/html.mjs';

const GRADE_TO_SLUG = new Map([
  ['1급', '리눅스마스터1급'],
  ['2급', '리눅스마스터2급'],
]);

const EXPECTED_SUBJECTS = new Map([
  ['1급', ['리눅스 실무의 이해', '리눅스 시스템 관리', '네트워크 및 서비스의 활용']],
  ['2급', ['리눅스 일반', '리눅스 운영 및 관리', '리눅스 활용']],
]);

const compact = value => String(value ?? '').replace(/\s+/g, ' ').trim();

function numberValue(value, label) {
  const match = compact(value).match(/(\d+)/);
  if (!match) throw new Error(`${label} 숫자를 찾지 못했다: ${value}`);
  return Number(match[1]);
}

function itemCount(value, label) {
  const text = compact(value);
  const range = text.match(/(\d+)\s*[~～-]\s*(\d+)/);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  return numberValue(text, label);
}

function modeOf(value) {
  const text = compact(value);
  if (/온라인시험.*객관식|객관식/.test(text)) return 'multiple-choice';
  if (/단답식|서술식/.test(text)) return 'written';
  if (/작업식/.test(text)) return 'practical';
  throw new Error(`지원하지 않는 검정방법: ${text}`);
}

function stageRows(rows, grade, step) {
  return rows.filter(row => compact(row['등급']) === grade && compact(row['차수']) === step);
}

function uniqueSubjects(rows, grade) {
  return [...new Set(rows
    .filter(row => compact(row['종목']) === grade)
    .map(row => compact(row['과목']))
    .filter(Boolean))];
}

function overviewStage({ id, name, rows, subjects, durationMinutes }) {
  const row = rows[0];
  if (rows.length !== 1) throw new Error(`${name}: 공식 구성 행이 ${rows.length}개다.`);
  const count = itemCount(row['문항수'], `${name} 문항수`);
  const mode = modeOf(row['검정방법']);
  return {
    id,
    name,
    durationMinutes,
    totalItemCount: count,
    sections: subjects.map(subject => ({ name: subject, mode })),
    note: `${compact(row['검정방법'])}, 과목별 문항 배분·제한시간은 공식 안내에 별도 공개되지 않음`,
  };
}

function mixedStage({ rows, subjects, durationMinutes }) {
  if (rows.length !== 2) throw new Error(`1급 2차: 필기·실기 행이 ${rows.length}개다.`);
  const written = rows.find(row => /단답식|서술식/.test(row['검정방법']));
  const practical = rows.find(row => /작업식/.test(row['검정방법']));
  if (!written || !practical) throw new Error('1급 2차 필기·실기 검정방법을 모두 찾지 못했다.');
  return {
    id: 'second',
    name: '2차 시험',
    durationMinutes,
    sections: [
      {
        name: '필기(단답식·서술식)',
        itemCount: itemCount(written['문항수'], '1급 2차 필기 문항수'),
        mode: 'written',
        scoreRange: { min: 0, max: 40 },
      },
      {
        name: '실기(작업식)',
        itemCount: itemCount(practical['문항수'], '1급 2차 실기 문항수'),
        mode: 'practical',
        scoreRange: { min: 0, max: 60 },
      },
    ],
    note: `출제범위: ${subjects.join(' · ')}. 필기 40%·실기 60%이며 두 방식은 100분 안에 통합 시행`,
  };
}

function detailForGrade({ source, grade, formatRows, subjects, checkedAt }) {
  const slug = GRADE_TO_SLUG.get(grade);
  if (!source.examSlugs.includes(slug)) throw new Error(`${grade}: 출처에 등록되지 않은 종목 ${slug}`);
  const firstRows = stageRows(formatRows, grade, '1차');
  const secondRows = stageRows(formatRows, grade, '2차');
  const expectedSubjects = EXPECTED_SUBJECTS.get(grade);
  if (JSON.stringify(subjects) !== JSON.stringify(expectedSubjects)) {
    throw new Error(`${grade}: 공식 검정 과목 불일치 (${subjects.join(', ') || '없음'})`);
  }

  const firstDuration = numberValue(firstRows[0]?.['시험시간'], `${grade} 1차 시험시간`);
  const secondDuration = numberValue(secondRows[0]?.['시험시간'], `${grade} 2차 시험시간`);
  const stages = grade === '1급'
    ? [
        overviewStage({ id: 'first', name: '1차 시험', rows: firstRows, subjects, durationMinutes: firstDuration }),
        mixedStage({ rows: secondRows, subjects, durationMinutes: secondDuration }),
      ]
    : [
        overviewStage({ id: 'first', name: '1차 온라인시험', rows: firstRows, subjects: [subjects[0]], durationMinutes: firstDuration }),
        overviewStage({ id: 'second', name: '2차 시험', rows: secondRows, subjects: subjects.slice(1), durationMinutes: secondDuration }),
      ];

  return {
    examSlug: slug,
    catalogStatus: 'published',
    sourceRefs: [source.id],
    classification: {
      kind: 'private-accredited',
      label: '국가공인 민간자격',
      authority: source.authority,
      sourceUrl: source.sourceUrl,
      checkedAt,
    },
    result: {
      type: 'pass-fail',
      label: '1차·2차 단계별 합격제',
      passCriteria: grade === '1급'
        ? '1차: 60점 이상이면서 과목별 40% 이상 · 2차: 60점 이상'
        : '1차: 60점 이상 · 2차: 60점 이상이면서 과목별 40% 이상',
    },
    deliveryModes: grade === '1급'
      ? ['1차 시험장 객관식', '2차 필기·작업식 통합']
      : ['1차 온라인 객관식', '2차 시험장 객관식'],
    formats: [{
      checkedAt,
      sourceUrl: source.sourceUrl,
      totalDurationMinutes: firstDuration + secondDuration,
      summary: grade === '1급'
        ? '1차 100문항·100분 · 2차 필기 10문항·실기 5~7문항·100분'
        : '1차 50문항·60분 · 2차 80문항·100분',
      stages,
      note: '1차와 2차는 별도 일정으로 시행하며, 실제 시작시각과 입실 마감은 회차별 수험표를 확인해야 합니다.',
    }],
  };
}

export function parseKaitLinuxDetail(html, { source, observedAt }) {
  const tables = readTables(html);
  const formatTable = tableByHeader(tables, ['등급', '차수', '검정방법', '문항수', '시험시간', '합격']);
  const subjectTable = tableByHeader(tables, ['종목', '과목', '검정항목']);
  if (!formatTable || !subjectTable) {
    return {
      details: [],
      diagnostics: {
        discovered: 0,
        included: 0,
        missing: [...source.examSlugs],
        unclassified: [],
        failures: ['리눅스마스터 자격 개요 또는 검정 내용 표를 찾지 못했다.'],
      },
    };
  }

  const formatRows = rowsAsObjects(formatTable);
  const subjectRows = rowsAsObjects(subjectTable);
  const discoveredGrades = [...new Set(formatRows.map(row => compact(row['등급'])).filter(Boolean))];
  const unclassified = discoveredGrades.filter(grade => !GRADE_TO_SLUG.has(grade));
  const details = [];
  const failures = [];
  const checkedAt = observedAt.slice(0, 10);
  for (const grade of GRADE_TO_SLUG.keys()) {
    try {
      details.push(detailForGrade({
        source,
        grade,
        formatRows,
        subjects: uniqueSubjects(subjectRows, grade),
        checkedAt,
      }));
    } catch (error) {
      failures.push(`${grade}: ${error?.message ?? error}`);
    }
  }
  const included = new Set(details.map(detail => detail.examSlug));
  return {
    details,
    diagnostics: {
      discovered: discoveredGrades.length,
      included: details.length,
      missing: source.examSlugs.filter(slug => !included.has(slug)),
      unclassified,
      failures,
    },
  };
}
