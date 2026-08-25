import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkDetailSources } from './detail-source-check.mjs';

const source = (over = {}) => ({
  id: 'official', name: '공식 상세', authority: '시행기관', method: 'html',
  collectionStatus: 'active', adapter: 'official-html', sourceUrl: 'https://example.com/detail',
  cadenceDays: 7, reviewMode: 'draft-pr', covers: ['formats'], examSlugs: ['시험A'],
  robots: { status: 'allowed', checkedAt: '2026-08-24', url: 'https://example.com/robots.txt' },
  ...over,
});

test('활성 자동 출처 계약과 커버리지를 계산한다', () => {
  const result = checkDetailSources({ sources: [source()] }, ['시험A', '시험B'], {
    knownAdapters: ['official-html'],
  });
  assert.equal(result.ok, true, result.problems.join('\n'));
  assert.deepEqual(result.coverage.registered, ['시험A']);
  assert.deepEqual(result.coverage.active, ['시험A']);
  assert.deepEqual(result.coverage.activeAutomatic, ['시험A']);
  assert.deepEqual(result.coverage.activeManual, []);
  assert.deepEqual(result.coverage.uncovered, ['시험B']);
});

test('planned 출처는 등록됐지만 활성 수집으로 세지 않는다', () => {
  const result = checkDetailSources({ sources: [source({ collectionStatus: 'planned', adapter: 'later' })] }, ['시험A']);
  assert.equal(result.ok, true, result.problems.join('\n'));
  assert.deepEqual(result.coverage.registered, ['시험A']);
  assert.deepEqual(result.coverage.active, []);
});

test('자동 출처는 robots 허용 없이는 활성화할 수 없다', () => {
  const result = checkDetailSources({ sources: [source({ robots: { status: 'blocked', checkedAt: '2026-08-24' } })] }, ['시험A']);
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /robots가 허용되지 않은 자동 출처/);
});

test('승인형 업로드는 여러 공식 종목 URL을 추적할 수 있다', () => {
  const result = checkDetailSources({ sources: [source({
    method: 'manual-upload', adapter: 'normalized-detail-json', sourceUrl: undefined,
    sourceUrls: ['https://example.com/a', 'https://example.com/b'],
    robots: { status: 'not-applicable', checkedAt: '2026-08-24' },
  })] }, ['시험A'], { knownAdapters: ['normalized-detail-json'] });
  assert.equal(result.ok, true, result.problems.join('\n'));
});

test('자동 출처는 다중 수동 URL 계약을 쓸 수 없다', () => {
  const result = checkDetailSources({ sources: [source({
    sourceUrl: undefined, sourceUrls: ['https://example.com/a'],
  })] }, ['시험A'], { knownAdapters: ['official-html'] });
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /자동 출처는 sourceUrls/);
});

test('다중 공식 URL은 단일 URL과 섞거나 중복할 수 없다', () => {
  const result = checkDetailSources({ sources: [source({
    method: 'manual-upload', adapter: 'normalized-detail-json',
    sourceUrls: ['https://example.com/a', 'https://example.com/a'],
    robots: { status: 'not-applicable', checkedAt: '2026-08-24' },
  })] }, ['시험A'], { knownAdapters: ['normalized-detail-json'] });
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /중복 공식 출처/);
  assert.match(result.problems.join('\n'), /함께 쓸 수 없다/);
});

test('활성 출처의 미구현 adapter와 잘못된 종목을 잡는다', () => {
  const result = checkDetailSources({ sources: [source({ examSlugs: ['없는시험'] })] }, ['시험A'], {
    knownAdapters: ['다른-adapter'],
  });
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /구현되지 않았다/);
  assert.match(result.problems.join('\n'), /시험 시드에 없는 종목/);
});

test('출처 id로 후보·원문 경로를 벗어날 수 없다', () => {
  const result = checkDetailSources({ sources: [source({ id: '../outside' })] }, ['시험A'], {
    knownAdapters: ['official-html'],
  });
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /영문 소문자·숫자·하이픈/);
});

test('전체 등록 게이트는 미등록 시험을 실패시킨다', () => {
  const result = checkDetailSources({ sources: [source()] }, ['시험A', '시험B'], { requireAllRegistered: true });
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /시험B/);
});

test('저장소 출처 레지스트리가 통과한다', async () => {
  const [registry, exams] = await Promise.all([
    readFile('data/detail-sources.seed.json', 'utf8').then(JSON.parse),
    readFile('data/exams.seed.json', 'utf8').then(JSON.parse),
  ]);
  const visible = exams.exams.filter(exam => exam.tier !== 'X').map(exam => exam.slug);
  const result = checkDetailSources(registry, visible, { knownAdapters: ['normalized-detail-json', 'qnet-detail', 'kait-linux-detail', 'kacpta-detail'] });
  assert.equal(result.ok, true, result.problems.join('\n'));
  assert.equal(result.coverage.registered.length, 68);
  assert.equal(result.coverage.uncovered.length, visible.length - 68);
});
