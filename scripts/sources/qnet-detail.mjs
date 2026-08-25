const STAGE_LABELS = new Map([
  ['필기', { id: 'written', name: '필기시험' }],
  ['실기', { id: 'practical', name: '실기시험' }],
  ['면접', { id: 'interview', name: '면접시험' }],
]);

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&nbsp;|&ensp;|&emsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&middot;/gi, '·')
    .replace(/&bull;/gi, '•')
    .replace(/&lsquo;|&rsquo;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

function linesOf(html) {
  return decodeEntities(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[０-９]/g, character => String.fromCharCode(character.charCodeAt(0) - 0xfee0))
    .replace(/[．｡。]/g, '.')
    .replace(/[～〜]/g, '~')
    .replace(/[–—]/g, '-')
    .split(/\r?\n/)
    .map(line => line.replace(/[\t \u00a0]+/g, ' ').trim())
    .filter(Boolean);
}

function comparableExamName(value) {
  return decodeEntities(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/취득방법|분야/g, '')
    .replace(/[^0-9A-Za-z가-힣]/g, '')
    .toLowerCase();
}

export function qnetMethodDocument(pageHtml) {
  const candidates = [...String(pageHtml ?? '').matchAll(
    /<textarea\b[^>]*\bid\s*=\s*["']contents_text_\d+["'][^>]*>([\s\S]*?)<\/textarea>/gi,
  )].map(match => decodeEntities(match[1]));
  const document = candidates.find(candidate => /시험과목/.test(candidate) && /검정방법/.test(candidate));
  if (!document) throw new Error('시험과목·검정방법이 있는 취득방법 원문을 찾지 못했다.');
  return document;
}

function headingIndex(lines, heading) {
  return lines.findIndex(line => new RegExp(`(?:^|\\s)${heading}(?:\\s|[:(']|$)`).test(line.replace(/[①②③④⑤⑥⑦⑧⑨⑩]/g, ' ')));
}

function segment(lines, startHeading, endHeading) {
  const start = headingIndex(lines, startHeading);
  const end = headingIndex(lines, endHeading);
  if (start < 0 || end < 0 || end <= start) throw new Error(`${startHeading}·${endHeading} 구간을 찾지 못했다.`);
  const inline = lines[start].slice(lines[start].indexOf(startHeading) + startHeading.length)
    .replace(/^\s*(?:\([^)]*\))?\s*:?\s*/, '')
    .trim();
  return [...(inline ? [inline] : []), ...lines.slice(start + 1, end)];
}

function trailingSegment(lines, heading) {
  const start = headingIndex(lines, heading);
  if (start < 0) throw new Error(`${heading} 구간을 찾지 못했다.`);
  const inline = lines[start].slice(lines[start].indexOf(heading) + heading.length).replace(/^\s*:?\s*/, '').trim();
  return [...(inline ? [inline] : []), ...lines.slice(start + 1)];
}

function stageEntries(lines) {
  const entries = new Map();
  const text = lines.join(' ').replace(/\s+/g, ' ').trim();
  const markers = [...text.matchAll(/(?:^|\s)[\-·•※*]?\s*(필기|실기|면접)(?:시험)?(?:\s*:\s*|\s+(?=\d{1,2}[.)]))/g)];
  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    const content = text.slice(marker.index + marker[0].length, markers[index + 1]?.index ?? text.length)
      .split(/\s+(?:작업형\s+실기시험\s+기본정보|안전등급|※|과정평가형)/)[0]
      .replace(/^[:\s]+|[\s.;]+$/g, '')
      .trim();
    entries.set(marker[1], content);
  }
  return entries;
}

function numberedSubjects(value) {
  const text = value.replace(/^[:\s]+/, '').replace(/[.;,\s]+$/, '').trim();
  const matches = [...text.matchAll(/(?:^|\s)(\d{1,2})[.)]\s*/g)];
  if (!matches.length) return text ? [text] : [];
  return matches.map((match, index) => text
    .slice(match.index + match[0].length, matches[index + 1]?.index ?? text.length)
    .replace(/[.;,\s]+$/, '')
    .trim())
    .filter(Boolean);
}

function minutesOf(fragment) {
  const match = String(fragment ?? '').match(/(?:(\d+)\s*시간)?\s*(?:(\d+)\s*분)?/);
  if (!match || (!match[1] && !match[2])) return null;
  return Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
}

function durationOf(method, subjectCount) {
  const inheritedRange = method.match(/(\d+)\s*[~-]\s*(\d+)\s*(시간|분)/);
  if (inheritedRange) {
    const unit = inheritedRange[3] === '시간' ? 60 : 1;
    return { min: Number(inheritedRange[1]) * unit, max: Number(inheritedRange[2]) * unit };
  }
  const explicitRange = method.match(/((?:\d+\s*시간)(?:\s*\d+\s*분)?|\d+\s*분)\s*[~-]\s*((?:\d+\s*시간)(?:\s*\d+\s*분)?|\d+\s*분)/);
  if (explicitRange) {
    const min = minutesOf(explicitRange[1]);
    const max = minutesOf(explicitRange[2]);
    if (min && max) return min <= max ? { min, max } : { min: max, max: min };
  }
  const durations = [...method.matchAll(/(?:(\d+)\s*시간)\s*(?:(\d+)\s*분)?|(\d+)\s*분/g)]
    .map(match => Number(match[1] ?? 0) * 60 + Number(match[2] ?? match[3] ?? 0))
    .filter(Boolean);
  if (!durations.length) return undefined;
  if (/과목당\s*\d+\s*분/.test(method) && subjectCount > 1) return durations[0] * subjectCount;
  const total = method.match(/총\s*(?:(\d+)\s*시간)?\s*(?:(\d+)\s*분)?/);
  if (total && (total[1] || total[2])) return Number(total[1] ?? 0) * 60 + Number(total[2] ?? 0);
  if (durations.length > 1 && /[)\]]\s*(?:\+|및)\s*[^([]+[([]/.test(method)) return durations.reduce((sum, value) => sum + value, 0);
  return durations[0];
}

function modeOf(method) {
  const modes = [];
  if (/객관식|선택형/.test(method)) modes.push('multiple-choice');
  if (/필답형|논술형|주관식|단답형/.test(method)) modes.push('written');
  if (/작업형/.test(method)) modes.push('practical');
  if (/면접|구술/.test(method)) modes.push('interview');
  if (/컴퓨터|프로그램/.test(method)) modes.push('computer-task');
  return modes.length > 1 ? 'mixed' : modes[0];
}

function itemCountOf(method, subjectCount) {
  const perSubject = method.match(/과목당\s*(\d+)\s*문항/);
  if (perSubject) return { perSection: Number(perSubject[1]) };
  const total = method.match(/(?:총\s*)?(\d+)\s*문항/);
  if (total) return subjectCount === 1 ? { perSection: Number(total[1]) } : { total: Number(total[1]) };
  return {};
}

function scoreOf(criteria, subjectCount) {
  const total = criteria.match(/(\d+)\s*점을?\s*만점/);
  if (!total) return {};
  const max = Number(total[1]);
  return /과목당/.test(criteria) && subjectCount > 1
    ? { perSection: { min: 0, max } }
    : { total: max };
}

function deliveryLabel(stageKey, method) {
  const labels = [];
  if (/객관식/.test(method)) labels.push('객관식');
  if (/선택형/.test(method) && !labels.includes('객관식')) labels.push('선택형');
  if (/필답형/.test(method)) labels.push('필답형');
  if (/논술형/.test(method)) labels.push('논술형');
  if (/작업형/.test(method)) labels.push('작업형');
  if (/면접|구술/.test(method)) labels.push('면접');
  if (/컴퓨터|프로그램/.test(method)) labels.push('컴퓨터 작업');
  return labels.length ? `${stageKey} ${labels.join('·')}` : `${stageKey}시험`;
}

function addDurations(values) {
  if (!values.length || values.some(value => value === undefined)) return undefined;
  if (values.every(Number.isInteger)) return values.reduce((sum, value) => sum + value, 0);
  return values.reduce((total, value) => {
    const min = Number.isInteger(value) ? value : value.min;
    const max = Number.isInteger(value) ? value : value.max;
    return {
      min: total.min === undefined || min === undefined ? undefined : total.min + min,
      max: total.max === undefined || max === undefined ? undefined : total.max + max,
    };
  }, { min: 0, max: 0 });
}

function summarize(stages) {
  return stages.map(stage => {
    const count = stage.sections.length > 1 ? `${stage.sections.length}과목` : stage.sections[0].name;
    const items = Number.isInteger(stage.totalItemCount)
      ? stage.totalItemCount
      : stage.sections.reduce((sum, section) => sum + (Number.isInteger(section.itemCount) ? section.itemCount : 0), 0);
    const duration = Number.isInteger(stage.durationMinutes) ? `${stage.durationMinutes}분` : null;
    return [stage.name.replace('시험', ''), count, items ? `${items}문항` : null, duration].filter(Boolean).join('·');
  }).join(' · ');
}

export function parseQnetPage(page, { source, checkedAt }) {
  const methodHtml = qnetMethodDocument(page.html);
  const officialTitle = methodHtml.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (!officialTitle) throw new Error('취득방법 문서 제목을 찾지 못했다.');
  const expectedName = comparableExamName(page.examSlug);
  const actualName = comparableExamName(officialTitle);
  if (!expectedName || !actualName || (!expectedName.startsWith(actualName) && !actualName.startsWith(expectedName))) {
    throw new Error(`종목명 불일치: 요청 ${page.examSlug}, 공식 문서 ${decodeEntities(officialTitle).replace(/<[^>]+>/g, '').trim()}`);
  }
  const lines = linesOf(methodHtml);
  const subjectEntries = stageEntries(segment(lines, '시험과목', '검정방법'));
  const methodEntries = stageEntries(segment(lines, '검정방법', '합격기준'));
  const criteriaLines = trailingSegment(lines, '합격기준');
  const criteriaEntries = stageEntries(criteriaLines);
  const stageKeys = [...new Set([...methodEntries.keys(), ...subjectEntries.keys(), ...criteriaEntries.keys()])];
  if (!stageKeys.length) throw new Error('필기·실기·면접 단계를 찾지 못했다.');
  const commonSubject = subjectEntries.size ? null : segment(lines, '시험과목', '검정방법').join(' ').replace(/^\s*:?\s*/, '').trim();
  const commonCriteria = criteriaEntries.size ? null : criteriaLines.join(' ')
    .replace(/^[-\s]*(?:필실기|필기\s*[·ㆍ,/]?\s*실기)\s*:?\s*/u, '')
    .split(/\s+(?:작업형\s+실기시험\s+기본정보|안전등급|※|과정평가형)/)[0]
    .trim();

  const stages = stageKeys.map(stageKey => {
    const stageMeta = STAGE_LABELS.get(stageKey);
    const subjectText = subjectEntries.get(stageKey) ?? commonSubject;
    const method = methodEntries.get(stageKey);
    if (!stageMeta) throw new Error(`${stageKey}: 지원하지 않는 시험 단계다.`);
    if (!method) throw new Error(`${stageKey}: 검정방법을 찾지 못했다.`);
    const subjects = numberedSubjects(subjectText ?? '')
      .filter(subject => !/^(?:필기|실기|면접)(?:시험)?$/u.test(subject));
    if (!subjects.length) subjects.push(stageMeta.name);
    const mode = modeOf(method);
    const resolvedMeta = stageKey === '실기' && mode === 'interview'
      ? STAGE_LABELS.get('면접')
      : stageMeta;
    const itemCount = itemCountOf(method, subjects.length);
    const stageCriteria = criteriaEntries.get(stageKey) ?? commonCriteria ?? '';
    const score = scoreOf(stageCriteria, subjects.length);
    const durationMinutes = durationOf(method, subjects.length);
    return {
      id: resolvedMeta.id,
      name: resolvedMeta.name,
      ...(durationMinutes !== undefined ? { durationMinutes } : {}),
      ...(itemCount.total ? { totalItemCount: itemCount.total } : {}),
      ...(score.total ? { totalScore: score.total } : {}),
      sections: subjects.map(subjectName => {
        const embeddedCount = subjectName.match(/[（(]\s*(\d+)\s*(?:문제|문항)\s*[)）]/);
        const name = subjectName.replace(/[（(]\s*\d+\s*(?:문제|문항)\s*[)）]/, '').trim();
        return {
        name,
        ...(itemCount.perSection || embeddedCount ? { itemCount: itemCount.perSection ?? Number(embeddedCount[1]) } : {}),
        ...(mode ? { mode } : {}),
        ...(score.perSection ? { scoreRange: score.perSection } : {}),
      }; }),
      note: method,
    };
  });
  const criteria = criteriaEntries.size
    ? stageKeys.filter(stageKey => criteriaEntries.get(stageKey)).map(stageKey => `${stageKey}: ${criteriaEntries.get(stageKey)}`).join(' · ')
    : commonCriteria;
  if (!criteria) throw new Error('단계별 합격기준을 찾지 못했다.');
  const deliveryModes = stageKeys.map(stageKey => deliveryLabel(stageKey, methodEntries.get(stageKey) ?? ''));
  const totalDurationMinutes = addDurations(stages.map(stage => stage.durationMinutes));
  const format = {
    checkedAt,
    sourceUrl: page.url,
    ...(totalDurationMinutes !== undefined ? { totalDurationMinutes } : {}),
    summary: summarize(stages),
    stages,
    note: '실제 시작시각은 회차·시험장별 수험표를 확인해야 합니다.',
  };
  return {
    examSlug: page.examSlug,
    catalogStatus: 'published',
    sourceRefs: [source.id],
    classification: {
      kind: 'national-technical',
      label: '국가기술자격',
      authority: source.authority,
      sourceUrl: page.url,
      checkedAt,
    },
    result: {
      type: 'pass-fail',
      label: stageKeys.length > 1 ? `${stageKeys.join('·')} 합격제` : `${stageKeys[0]} 합격제`,
      passCriteria: criteria,
    },
    deliveryModes: [...new Set(deliveryModes)],
    formats: [format],
  };
}

export function parseQnetDetailBundle(raw, { source, observedAt }) {
  const bundle = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const pages = Array.isArray(bundle?.pages) ? bundle.pages : [];
  const expected = new Set(source.examSlugs);
  const seen = new Set();
  const details = [];
  const failures = [];
  const unclassified = [];
  for (const page of pages) {
    if (!expected.has(page?.examSlug)) {
      unclassified.push(page?.examSlug ?? '(시험명 없음)');
      continue;
    }
    if (seen.has(page.examSlug)) {
      failures.push(`${page.examSlug}: 원문이 중복됐다.`);
      continue;
    }
    seen.add(page.examSlug);
    try {
      details.push(parseQnetPage(page, { source, checkedAt: observedAt.slice(0, 10) }));
    } catch (error) {
      failures.push(`${page.examSlug}: ${error?.message ?? error}`);
    }
  }
  return {
    details,
    diagnostics: {
      discovered: pages.length,
      included: details.length,
      missing: [...expected].filter(slug => !seen.has(slug)),
      unclassified,
      failures,
    },
  };
}

const retryable = error => /fetch failed|timeout|timed out|aborted|HTTP (?:429|5\d\d)/i.test(error?.message ?? String(error));

async function fetchWithRetry(task, sleep) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (!retryable(error) || attempt === 3) throw error;
      await sleep(attempt * 500);
    }
  }
  throw lastError;
}

export async function collectQnetDetails({ source, exams, fetchDetailUrl, robotsCache, sourceUrlOf, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const bySlug = new Map(exams.map(exam => [exam.slug, exam]));
  const pages = [];
  for (const examSlug of source.examSlugs) {
    const exam = bySlug.get(examSlug);
    if (!exam) throw new Error(`${examSlug}: 시험 시드가 없다.`);
    const url = sourceUrlOf(source, exam);
    try {
      const html = await fetchWithRetry(() => fetchDetailUrl(source, url, fetch, robotsCache), sleep);
      pages.push({ examSlug, jmCd: exam.jmCd, url, html });
    } catch (error) {
      throw new Error(`${examSlug}: 공식 상세 수집 실패 — ${error?.message ?? error}`);
    }
  }
  const bundle = { pages };
  return { raw: bundle, parseInput: bundle };
}
