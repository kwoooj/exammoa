import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkDetailProposal,
  createDetailProposal,
  detailContentHash,
  normalizedDetailHash,
  promoteDetailProposal,
  semanticDetailChanges,
} from './detail-proposal.mjs';

const source = {
  id: 'official', examSlugs: ['시험A'],
};

const detail = (over = {}) => ({
  examSlug: '시험A', catalogStatus: 'published', sourceRefs: ['official'],
  classification: {
    kind: 'national-technical', label: '국가기술자격', authority: '시행기관',
    sourceUrl: 'https://example.com/class', checkedAt: '2026-08-24',
  },
  result: { type: 'pass-fail', label: '합격제' },
  deliveryModes: ['시험장 시험'],
  formats: [{
    effectiveFrom: '2026-01-01', checkedAt: '2026-08-24', sourceUrl: 'https://example.com/format',
    stages: [{ id: 'single', name: '시험', durationMinutes: 60, totalScore: 100, sections: [{ name: '전체' }] }],
  }],
  ...over,
});

const proposal = (over = {}) => ({
  version: 1, sourceId: 'official', status: 'review-required', observedAt: '2026-08-24T00:00:00Z',
  contentHash: normalizedDetailHash([detail()]),
  archiveHash: detailContentHash('raw'),
  archivePath: `data/archive/details/2026/official.2026-08-24T000000Z.${detailContentHash('raw').slice(0, 12)}.html`,
  diagnostics: { discovered: 1, included: 1, missing: [], unclassified: [], failures: [] },
  details: [detail()],
  ...over,
});

test('원문 해시와 진단이 있는 후보를 만든다', () => {
  const made = createDetailProposal({
    source, raw: 'raw', archivePath: proposal().archivePath, observedAt: '2026-08-24T00:00:00Z',
    details: [detail()], diagnostics: proposal().diagnostics,
  });
  assert.equal(made.archiveHash, detailContentHash('raw'));
  assert.equal(made.contentHash, normalizedDetailHash([detail()]));
  assert.equal(checkDetailProposal(made, source, ['시험A']).ok, true);
});

test('부분 파싱 후보는 승격 전에 실패한다', () => {
  const result = checkDetailProposal(proposal({
    diagnostics: { discovered: 2, included: 1, missing: ['시험B'], unclassified: [], failures: [] },
  }), source, ['시험A']);
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /승격할 수 없다/);
  assert.match(result.problems.join('\n'), /수집 누락: 시험B/);
});

test('진단이 초록이어도 출처 등록 시험 일부가 빠지면 실패한다', () => {
  const twoExamSource = { id: 'official', examSlugs: ['시험A', '시험B'] };
  const result = checkDetailProposal(proposal(), twoExamSource, ['시험A', '시험B']);
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /출처 등록 시험이 후보에서 누락/);
  assert.match(result.problems.join('\n'), /출처 등록 시험 수/);
});

test('등록되지 않은 시험과 출처 참조 누락을 잡는다', () => {
  const result = checkDetailProposal(proposal({ details: [detail({ examSlug: '시험B', sourceRefs: [] })] }), source, ['시험A', '시험B']);
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /등록되지 않은 시험/);
  assert.match(result.problems.join('\n'), /sourceRefs/);
});

test('확인일만 바뀐 후보는 의미 변경으로 세지 않는다', () => {
  const later = detail({
    classification: { ...detail().classification, checkedAt: '2026-08-25' },
    formats: [{ ...detail().formats[0], checkedAt: '2026-08-25' }],
  });
  assert.deepEqual(semanticDetailChanges([detail()], [later]), []);
});

test('시간 변경은 의미 변경으로 센다', () => {
  const changed = detail({ formats: [{
    ...detail().formats[0], stages: [{ ...detail().formats[0].stages[0], durationMinutes: 70 }],
  }] });
  assert.equal(semanticDetailChanges([detail()], [changed]).length, 1);
});

test('후보 상세값을 해시 변경 없이 고치면 승격 검사에서 막는다', () => {
  const candidate = proposal();
  candidate.details[0].formats[0].stages[0].durationMinutes = 70;
  const result = checkDetailProposal(candidate, source, ['시험A']);
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /contentHash가 정규화 상세값과 다르다/);
});

test('승인 해시가 일치할 때만 정본에 승격한다', () => {
  const candidate = proposal();
  assert.throws(() => promoteDetailProposal({ details: [] }, candidate, source, {
    approvedHash: '0'.repeat(64), archiveHash: candidate.contentHash, knownExamSlugs: ['시험A'],
  }), /승인 해시/);
  assert.throws(() => promoteDetailProposal({ details: [] }, candidate, source, {
    approvedHash: candidate.contentHash, archiveHash: '0'.repeat(64), knownExamSlugs: ['시험A'],
  }), /보관 원문/);
  const promoted = promoteDetailProposal({ details: [] }, candidate, source, {
    approvedHash: candidate.contentHash, archiveHash: candidate.archiveHash, knownExamSlugs: ['시험A'],
  });
  assert.equal(promoted.details[0].catalogStatus, 'published');
});
