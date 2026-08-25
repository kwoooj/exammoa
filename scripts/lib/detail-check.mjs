const iso = value => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '');
const http = value => /^https:\/\//.test(value ?? '');
const positive = value => Number.isInteger(value) && value > 0;
const positiveCount = value => value === undefined
  || positive(value)
  || (value && typeof value === 'object'
    && (value.min === undefined || positive(value.min))
    && (value.max === undefined || positive(value.max))
    && (value.min !== undefined || value.max !== undefined)
    && (value.min === undefined || value.max === undefined || value.min <= value.max));
const positiveDuration = value => value === undefined
  || positive(value)
  || (value && typeof value === 'object'
    && (value.min === undefined || positive(value.min))
    && (value.max === undefined || positive(value.max))
    && (value.min !== undefined || value.max !== undefined)
    && (value.min === undefined || value.max === undefined || value.min <= value.max));

export function checkExamDetails(seed, knownExamSlugs = [], options = {}) {
  const problems = [];
  if (!Array.isArray(seed?.details)) return { ok: false, problems: ['details 배열이 없다.'] };

  const known = new Set(knownExamSlugs);
  const seen = new Set();
  for (const detail of seed.details) {
    const slug = detail?.examSlug ?? '(없음)';
    if (!detail?.examSlug || seen.has(detail.examSlug)) problems.push(`중복되거나 빈 examSlug: ${slug}`);
    seen.add(detail?.examSlug);
    if (options.sourceIds) {
      if (!Array.isArray(detail?.sourceRefs) || !detail.sourceRefs.length) {
        problems.push(`${slug}: sourceRefs가 비었다.`);
      } else {
        const refs = new Set();
        for (const sourceId of detail.sourceRefs) {
          if (refs.has(sourceId)) problems.push(`${slug}: sourceRefs가 중복됐다 (${sourceId}).`);
          refs.add(sourceId);
          if (!options.sourceIds.has(sourceId)) problems.push(`${slug}: 등록되지 않은 상세 출처 ${sourceId}`);
        }
      }
    }
    if (!['published', 'planned'].includes(detail?.catalogStatus)) problems.push(`${slug}: catalogStatus가 올바르지 않다.`);
    if (detail?.catalogStatus === 'published' && !known.has(detail.examSlug)) problems.push(`${slug}: published 상세가 시험 시드에 없다.`);
    if (!detail?.classification?.label || !detail?.classification?.authority) problems.push(`${slug}: 자격 분류가 비었다.`);
    if (!http(detail?.classification?.sourceUrl) || !iso(detail?.classification?.checkedAt)) problems.push(`${slug}: 자격 분류 출처 또는 확인일이 올바르지 않다.`);
    if (!detail?.result?.label) problems.push(`${slug}: 결과 형태가 비었다.`);
    if (!Array.isArray(detail?.deliveryModes) || !detail.deliveryModes.length) problems.push(`${slug}: 응시 방식이 비었다.`);
    if (!Array.isArray(detail?.formats) || !detail.formats.length) {
      problems.push(`${slug}: 시험 구성 버전이 없다.`);
      continue;
    }
    const starts = new Set();
    const orderedFormats = [...detail.formats].sort((a, b) => (a.effectiveFrom ?? '').localeCompare(b.effectiveFrom ?? ''));
    for (let formatIndex = 0; formatIndex < orderedFormats.length; formatIndex += 1) {
      const format = orderedFormats[formatIndex];
      const previous = orderedFormats[formatIndex - 1];
      if (format.effectiveFrom === undefined) {
        if (detail.formats.length !== 1 || format.effectiveTo) problems.push(`${slug}: 적용일 미공개 구성은 단일 현행 버전이어야 한다.`);
      } else {
        if (!iso(format.effectiveFrom) || starts.has(format.effectiveFrom)) problems.push(`${slug}: 구성 적용일이 올바르지 않거나 중복이다.`);
        starts.add(format.effectiveFrom);
      }
      if (format.effectiveTo && (!iso(format.effectiveTo) || (format.effectiveFrom && format.effectiveTo < format.effectiveFrom))) problems.push(`${slug}: 구성 종료일이 올바르지 않다.`);
      if (previous && format.effectiveFrom && (!previous.effectiveTo || previous.effectiveTo >= format.effectiveFrom)) problems.push(`${slug}: 구성 적용 기간이 겹친다.`);
      if (!iso(format.checkedAt) || !http(format.sourceUrl)) problems.push(`${slug}: 구성 출처 또는 확인일이 올바르지 않다.`);
      if (!positiveDuration(format.totalDurationMinutes)) problems.push(`${slug}: 전체 시간이 올바르지 않다.`);
      if (!Array.isArray(format.stages) || !format.stages.length) problems.push(`${slug}: 시험 단계가 비었다.`);
      const stageIds = new Set();
      for (const stage of format.stages ?? []) {
        if (!stage.id || !stage.name || stageIds.has(stage.id) || !Array.isArray(stage.sections) || !stage.sections.length) problems.push(`${slug}: 시험 단계가 올바르지 않다.`);
        stageIds.add(stage.id);
        if (!positiveDuration(stage.durationMinutes)) problems.push(`${slug}: 단계 전체 시간이 올바르지 않다.`);
        if (!positiveCount(stage.totalItemCount)) problems.push(`${slug}: 단계 전체 문항 수가 올바르지 않다.`);
        if (stage.totalScore !== undefined && !positive(stage.totalScore)) problems.push(`${slug}: 단계 전체 배점이 올바르지 않다.`);
        const sectionNames = new Set((stage.sections ?? []).map(section => section.name));
        for (const section of stage.sections ?? []) {
          if (!section.name) problems.push(`${slug}: 빈 과목명이 있다.`);
          if (!positiveCount(section.itemCount) || !positiveCount(section.taskCount)) problems.push(`${slug}: 문항·과제 수가 올바르지 않다.`);
          if (section.scoreRange !== undefined
            && (!Number.isFinite(section.scoreRange.min)
              || !Number.isFinite(section.scoreRange.max)
              || section.scoreRange.min < 0
              || section.scoreRange.min >= section.scoreRange.max)) problems.push(`${slug}: 과목 배점 범위가 올바르지 않다.`);
        }
        let timedTotal = 0;
        for (const block of stage.timedBlocks ?? []) {
          if (!block?.name || !positiveDuration(block.durationMinutes)) problems.push(`${slug}: 강제 진행 구간이 올바르지 않다.`);
          if (Number.isInteger(block?.durationMinutes)) timedTotal += block.durationMinutes;
          for (const sectionName of block?.sectionNames ?? []) {
            if (!sectionNames.has(sectionName)) problems.push(`${slug}: 강제 진행 구간이 없는 과목을 참조한다.`);
          }
        }
        if (Number.isInteger(stage.durationMinutes)
          && stage.timedBlocks?.length
          && stage.timedBlocks.every(block => Number.isInteger(block.durationMinutes))
          && timedTotal !== stage.durationMinutes) problems.push(`${slug}: 강제 진행 구간 합계가 단계 전체 시간과 다르다.`);
      }
    }
  }
  if (options.requireAllPublished) {
    for (const slug of known) if (!seen.has(slug)) problems.push(`${slug}: 공개 시험 상세가 없다.`);
  }
  return { ok: problems.length === 0, problems };
}
