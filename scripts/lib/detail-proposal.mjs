import { createHash } from 'node:crypto';
import { checkExamDetails } from './detail-check.mjs';

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ARCHIVE = /^data\/archive\/details\/\d{4}\/[a-z0-9][a-z0-9-]*\.[^/]+\.(?:html|json|pdf|txt)$/;

export const detailContentHash = value => createHash('sha256').update(
  typeof value === 'string' || value instanceof Uint8Array ? value : JSON.stringify(value),
).digest('hex');

const sorted = value => {
  if (Array.isArray(value)) return value.map(sorted);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]));
};

const withoutObservationDates = value => {
  if (Array.isArray(value)) return value.map(withoutObservationDates);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'checkedAt')
    .map(([key, child]) => [key, withoutObservationDates(child)]));
};

/** 승인 대상인 정규화 상세값을 키 순서와 무관한 해시로 묶는다. */
export const normalizedDetailHash = details => detailContentHash(sorted(details));

/** 확인일만 달라진 경우에는 사용자에게 보이는 의미 변경으로 세지 않는다. */
export const semanticDetailFingerprint = detail => JSON.stringify(sorted(withoutObservationDates(detail)));

export function checkDetailProposal(proposal, source, knownExamSlugs = [], options = {}) {
  const problems = [];
  const expected = new Set(source?.examSlugs ?? []);
  if (proposal?.sourceId !== source?.id) problems.push('후보 sourceId가 출처와 다르다.');
  if (proposal?.status !== 'review-required') problems.push('후보 상태는 review-required여야 한다.');
  if (!ISO_INSTANT.test(proposal?.observedAt ?? '')) problems.push('observedAt이 UTC ISO 시각이 아니다.');
  if (!SHA256.test(proposal?.contentHash ?? '')) problems.push('contentHash가 SHA-256이 아니다.');
  if (!SHA256.test(proposal?.archiveHash ?? '')) problems.push('archiveHash가 SHA-256이 아니다.');
  if (!SAFE_ARCHIVE.test(proposal?.archivePath ?? '')) problems.push('archivePath가 상세 원문 경로가 아니다.');
  if (source?.id && !proposal?.archivePath?.includes(`/${source.id}.`)) problems.push('archivePath가 해당 sourceId 원문이 아니다.');
  if (SHA256.test(proposal?.archiveHash ?? '') && !proposal?.archivePath?.includes(`.${proposal.archiveHash.slice(0, 12)}.`)) {
    problems.push('archivePath의 해시와 archiveHash가 다르다.');
  }
  if (!Array.isArray(proposal?.details) || !proposal.details.length) {
    problems.push('후보 details가 비었다.');
  } else {
    const detailResult = checkExamDetails({ details: proposal.details }, knownExamSlugs, {
      sourceIds: options.sourceIds ?? new Set([source?.id]),
    });
    problems.push(...detailResult.problems.map(problem => `상세: ${problem}`));
    for (const detail of proposal.details) {
      if (!expected.has(detail.examSlug)) problems.push(`${detail.examSlug}: 이 출처에 등록되지 않은 시험이다.`);
      if (!detail.sourceRefs?.includes(source?.id)) problems.push(`${detail.examSlug}: sourceRefs에 ${source?.id}가 없다.`);
    }
    const includedSlugs = new Set(proposal.details.map(detail => detail.examSlug));
    const missingExpected = [...expected].filter(slug => !includedSlugs.has(slug));
    if (missingExpected.length) problems.push(`출처 등록 시험이 후보에서 누락됐다: ${missingExpected.join(', ')}`);
  }

  const diagnostics = proposal?.diagnostics;
  if (!diagnostics || !Number.isInteger(diagnostics.discovered) || !Number.isInteger(diagnostics.included)) {
    problems.push('후보 diagnostics 집계가 없다.');
  } else {
    if (diagnostics.discovered < 0 || diagnostics.included < 0 || diagnostics.included > diagnostics.discovered) {
      problems.push('후보 diagnostics 집계가 올바르지 않다.');
    }
    if (!Array.isArray(diagnostics.missing) || !Array.isArray(diagnostics.unclassified) || !Array.isArray(diagnostics.failures)) {
      problems.push('후보 diagnostics 누락·미분류·실패 배열이 없다.');
    }
    if (diagnostics.missing.length || diagnostics.unclassified.length || diagnostics.failures.length) {
      problems.push('후보에 누락·미분류·파싱 실패가 있어 승격할 수 없다.');
    }
    if (Array.isArray(proposal?.details) && diagnostics.included !== proposal.details.length) {
      problems.push('후보 included 수와 details 수가 다르다.');
    }
    if (diagnostics.included !== expected.size) problems.push('후보 included 수와 출처 등록 시험 수가 다르다.');
  }
  if (Array.isArray(proposal?.details) && SHA256.test(proposal?.contentHash ?? '')
    && normalizedDetailHash(proposal.details) !== proposal.contentHash) {
    problems.push('contentHash가 정규화 상세값과 다르다.');
  }
  return { ok: problems.length === 0, problems };
}

export function createDetailProposal({ source, raw, archivePath, observedAt, details, diagnostics }) {
  return {
    version: 1,
    sourceId: source.id,
    status: 'review-required',
    observedAt,
    contentHash: normalizedDetailHash(details),
    archiveHash: detailContentHash(raw),
    archivePath,
    diagnostics,
    details,
  };
}

export function semanticDetailChanges(currentDetails, candidateDetails) {
  const before = new Map(currentDetails.map(detail => [detail.examSlug, detail]));
  const after = new Map(candidateDetails.map(detail => [detail.examSlug, detail]));
  const slugs = [...new Set([...before.keys(), ...after.keys()])].sort((a, b) => a.localeCompare(b, 'ko'));
  return slugs.flatMap(slug => {
    const previous = before.get(slug);
    const next = after.get(slug);
    return semanticDetailFingerprint(previous) === semanticDetailFingerprint(next)
      ? []
      : [{ examSlug: slug, before: previous ?? null, after: next ?? null }];
  });
}

/** 후보 해시를 명시해야만 승인 정본에 병합한다. */
export function promoteDetailProposal(seed, proposal, source, options = {}) {
  if (options.approvedHash !== proposal?.contentHash) {
    throw new Error('승인 해시가 후보 contentHash와 다르다.');
  }
  if (options.archiveHash !== proposal?.archiveHash) {
    throw new Error('보관 원문의 SHA-256이 후보 archiveHash와 다르다.');
  }
  const validation = checkDetailProposal(proposal, source, options.knownExamSlugs ?? [], {
    sourceIds: options.sourceIds,
  });
  if (!validation.ok) throw new Error(validation.problems.join('\n'));

  const replacements = new Map(proposal.details.map(detail => [detail.examSlug, {
    ...detail,
    catalogStatus: 'published',
  }]));
  const next = [];
  for (const detail of seed.details ?? []) {
    next.push(replacements.get(detail.examSlug) ?? detail);
    replacements.delete(detail.examSlug);
  }
  next.push(...replacements.values());
  return { ...seed, details: next };
}
