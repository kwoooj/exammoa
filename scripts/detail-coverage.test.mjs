import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDetailCoverage, formatDetailCoverage } from './detail-coverage.mjs';

const exams = {
  categories: [{ id: 'lang', name: '어학' }],
  exams: [
    { slug: '시험A', tier: 'T1', category: 'lang' },
    { slug: '시험B', tier: 'T3', category: 'lang' },
    { slug: '제외', tier: 'X', category: 'lang' },
  ],
};
const detail = {
  examSlug: '시험A', catalogStatus: 'published', sourceRefs: ['official'],
  classification: { label: '공인', authority: '기관', sourceUrl: 'https://example.com', checkedAt: '2026-08-24' },
  result: { label: '합격제' }, deliveryModes: ['시험장'],
  formats: [{ effectiveFrom: '2026-01-01', checkedAt: '2026-08-24', sourceUrl: 'https://example.com', stages: [{ id: 'one', name: '시험', sections: [{ name: '전체' }] }] }],
};
const sources = { sources: [{
  id: 'official', name: '공식', authority: '기관', method: 'manual-upload', collectionStatus: 'active',
  adapter: 'normalized-detail-json', sourceUrl: 'https://example.com', cadenceDays: 30, reviewMode: 'draft-pr',
  robots: { status: 'not-applicable', checkedAt: '2026-08-24' }, covers: ['formats'], examSlugs: ['시험A'],
}] };

test('공개·누락·출처 커버리지를 분리한다', () => {
  const report = buildDetailCoverage(exams, { details: [detail] }, sources);
  assert.equal(report.ok, true, report.problems.join('\n'));
  assert.deepEqual(report.details, { published: 1, planned: 0, missing: 1, missingSlugs: ['시험B'] });
  assert.equal(report.sources.registered, 1);
  assert.equal(report.sources.activeAutomatic, 0);
  assert.equal(report.sources.activeManual, 1);
  assert.equal(report.sources.uncovered, 1);
  assert.match(formatDetailCoverage(report), /공개 1/);
});

test('strict 게이트는 상세와 출처 누락을 실패시킨다', () => {
  const report = buildDetailCoverage(exams, { details: [detail] }, sources, { strict: true });
  assert.equal(report.ok, false);
  assert.match(report.problems.join('\n'), /시험B/);
});
