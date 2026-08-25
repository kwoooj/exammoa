import { catalogPlaceholderSessions } from './catalog-placeholders.mjs';

const publishedFee = fee => fee ? {
  items: fee.items.map(item => ({ ...item })),
  checkedAt: fee.checkedAt,
  ...(fee.note ? { note: fee.note } : {}),
} : null;

// 같은 확인일이면 실제 수집값을 우선한다. 기관이 당일 인상한 값을 배치가 잡았는데
// 시드의 아침 기준값으로 되돌리는 경쟁 조건을 막는다.
const newerThan = (candidate, current) => !current?.checkedAt
  || String(candidate?.checkedAt ?? '') > String(current.checkedAt);

/**
 * 일정 수집 산출물에 사람이 승인한 카탈로그 시드를 결합한다.
 * 외부 기관이 잠시 응답하지 않아도 새 시험명·공식 링크·수기 검증 응시료는 배포할 수
 * 있어야 한다. 수집 성공 이력을 덮어쓰거나 날짜를 만들지 않고 미공고 회차만 추가한다.
 */
export function overlayCatalog({ publishedExams, publishedGroups, publishedSessions, publishedMeta, examSeed, groupSeed, feeSeed }) {
  const year = publishedSessions.year ?? publishedGroups.year ?? publishedMeta.year;
  const visibleExams = (examSeed.exams ?? []).filter(exam => exam.tier !== 'X');
  const currentExams = new Map((publishedExams.exams ?? []).map(exam => [exam.slug, exam]));
  const fees = new Map((feeSeed.fees ?? []).map(fee => [fee.slug, fee]));

  const exams = visibleExams.map(seedExam => {
    const current = currentExams.get(seedExam.slug);
    const candidateFee = fees.get(seedExam.slug);
    const fee = candidateFee && newerThan(candidateFee, current?.fee)
      ? publishedFee(candidateFee)
      : current?.fee;
    return { ...current, ...seedExam, ...(fee ? { fee } : {}) };
  });

  const retainedSessions = (publishedSessions.sessions ?? [])
    .filter(session => session.src !== 'catalog-placeholders');
  const scheduledGroups = new Set(retainedSessions.map(session => session.groupId));
  const placeholders = catalogPlaceholderSessions(visibleExams, groupSeed.groups, year)
    .filter(session => !scheduledGroups.has(session.groupId))
    .map(session => ({ ...session, src: 'catalog-placeholders', conf: 'manual' }));
  const sessions = [...retainedSessions, ...placeholders]
    .sort((a, b) => a.groupId.localeCompare(b.groupId) || (a.seq ?? 0) - (b.seq ?? 0));

  const sessionCountByGroup = new Map();
  for (const session of sessions) {
    sessionCountByGroup.set(session.groupId, (sessionCountByGroup.get(session.groupId) ?? 0) + 1);
  }
  const currentGroups = new Map((publishedGroups.groups ?? []).map(group => [group.id, group]));
  const groups = (groupSeed.groups ?? [])
    .filter(group => sessionCountByGroup.has(group.id))
    .map(group => ({
      ...currentGroups.get(group.id),
      ...group,
      sessionCount: sessionCountByGroup.get(group.id),
    }));

  const sources = { ...(publishedMeta.sources ?? {}) };
  if (placeholders.length) {
    sources['catalog-placeholders'] = {
      health: 'ok', method: 'manual', fetchedAt: null,
      sessionCount: placeholders.length, staleAfterDays: 365,
    };
  } else {
    delete sources['catalog-placeholders'];
  }
  const meta = {
    ...publishedMeta,
    examCount: exams.length,
    groupCount: sessionCountByGroup.size,
    sessionCount: sessions.length,
    eventCount: sessions.reduce((sum, session) => sum + (session.events?.length ?? 0), 0),
    tbdCount: sessions.filter(session => session.status === 'tbd').length,
    staleCount: sessions.filter(session => session.stale).length,
    feeCoverage: exams.filter(exam => exam.fee?.items?.length).length,
    feeManualCount: visibleExams.filter(exam => fees.get(exam.slug)?.source?.kind === 'manual').length,
    sources,
  };

  return {
    exams: { exams, categories: examSeed.categories, links: examSeed.links },
    groups: { year, groups },
    sessions: { year, sessions },
    meta,
  };
}
