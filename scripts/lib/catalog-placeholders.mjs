/**
 * 공식 링크와 시험 항목은 검증됐지만 일정 수집기가 아직 없는 수동 종목을
 * 검색·즐겨찾기에서 숨기지 않는다. 날짜는 만들지 않고 tbd 회차만 둔다.
 */
export function catalogPlaceholderSessions(exams, groups, year) {
  const manualGroupIds = new Set((exams ?? [])
    .filter(exam => exam.collect === 'manual' && !exam.rolling)
    .map(exam => exam.groupId));

  return (groups ?? [])
    .filter(group => group.cadence !== 'rolling' && manualGroupIds.has(group.id))
    .map(group => ({
      id: `${group.id}-${year}-tbd`,
      groupId: group.id,
      year,
      seq: null,
      label: `${year}년 일정 미공고`,
      mode: 'scheduled',
      status: 'tbd',
      scheduleState: 'import-pending',
      events: [],
    }));
}
