import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXISTING_SCHEDULE_DETAIL_CONFIGS,
  parseExistingScheduleDetailBundle,
} from './existing-schedule-detail.mjs';

const sourceFor = id => {
  const config = EXISTING_SCHEDULE_DETAIL_CONFIGS[id];
  return { id, authority: '공식 시행기관', sourceUrl: Object.values(config.pages)[0], examSlugs: [config.slug] };
};

const bundleFor = id => {
  const config = EXISTING_SCHEDULE_DETAIL_CONFIGS[id];
  return {
    pages: Object.entries(config.pages).map(([page, url]) => ({
      page,
      url,
      html: Object.values(config.fingerprints[page]).join(' · '),
    })),
  };
};

const parse = id => parseExistingScheduleDetailBundle(bundleFor(id), {
  source: sourceFor(id),
  observedAt: '2026-08-25T00:00:00.000Z',
});

test('한국사는 심화·기본의 전체 문항·점수와 서로 다른 총시간을 한 선택 시험으로 제공한다', () => {
  const result = parse('history-exam-detail');
  assert.deepEqual(result.diagnostics, {
    discovered: 1, included: 1, missing: [], unclassified: [], failures: [],
  });
  const detail = result.details[0];
  assert.equal(detail.classification.kind, 'institutional-assessment');
  assert.equal(detail.result.type, 'level-awarded');
  assert.deepEqual(detail.formats[0].totalDurationMinutes, { min: 70, max: 80 });
  assert.equal(detail.formats[0].stages[0].totalItemCount, 50);
  assert.equal(detail.formats[0].stages[0].totalScore, 100);
  assert.equal(detail.formats[0].stages[0].timedBlocks, undefined);
});

test('KBS한국어는 공식적으로 강제되는 듣기·말하기와 지필 시간만 분리한다', () => {
  const detail = parse('kbs-korean-detail').details[0];
  const stage = detail.formats[0].stages[0];
  assert.equal(detail.classification.kind, 'private-accredited');
  assert.equal(stage.totalItemCount, 100);
  assert.equal(stage.totalScore, 100);
  assert.deepEqual(stage.sections.map(section => section.itemCount), [15, 85]);
  assert.deepEqual(stage.timedBlocks.map(block => block.durationMinutes), [25, 95]);
  assert.equal(stage.timedBlocks.reduce((sum, block) => sum + block.durationMinutes, 0), stage.durationMinutes);
});

test('토익스피킹은 11문항·약 20분과 전체 200점만 합산하고 문항 제한은 설명에 둔다', () => {
  const detail = parse('ybm-toeic-speaking-detail').details[0];
  const stage = detail.formats[0].stages[0];
  assert.equal(detail.classification.kind, 'international-assessment');
  assert.equal(stage.totalItemCount, 11);
  assert.equal(stage.totalScore, 200);
  assert.deepEqual(stage.sections.map(section => section.itemCount), [2, 2, 3, 3, 1]);
  assert.deepEqual([...new Set(stage.sections.map(section => section.mode))], ['recorded-response']);
  assert.equal(stage.timedBlocks, undefined);
  assert.match(stage.sections[0].note, /준비 45초/);
});

test('공식 페이지가 빠지거나 지문·URL·출처 종목이 바뀌면 게시하지 않는다', () => {
  const id = 'kbs-korean-detail';
  const missing = bundleFor(id);
  missing.pages.pop();
  const missingResult = parseExistingScheduleDetailBundle(missing, {
    source: sourceFor(id), observedAt: '2026-08-25T00:00:00.000Z',
  });
  assert.deepEqual(missingResult.diagnostics.missing, ['KBS한국어능력시험']);
  assert.match(missingResult.diagnostics.failures[0], /원문이 없다/);

  const changed = bundleFor(id);
  changed.pages[0].html = changed.pages[0].html.replace('25분', '30분');
  changed.pages[1].url = 'https://example.com/changed';
  const changedResult = parseExistingScheduleDetailBundle(changed, {
    source: sourceFor(id), observedAt: '2026-08-25T00:00:00.000Z',
  });
  assert.equal(changedResult.details.length, 0);
  assert.equal(changedResult.diagnostics.failures.length, 2);

  assert.throws(() => parseExistingScheduleDetailBundle(bundleFor(id), {
    source: { ...sourceFor(id), examSlugs: ['다른시험'] },
    observedAt: '2026-08-25T00:00:00.000Z',
  }), /출처 종목/);
});

test('알 수 없는 공식 페이지가 생기면 무음 제외하지 않는다', () => {
  const id = 'history-exam-detail';
  const bundle = bundleFor(id);
  bundle.pages.push({ page: 'new-page', url: 'https://example.com/new', html: '새 종목' });
  const result = parseExistingScheduleDetailBundle(bundle, {
    source: sourceFor(id), observedAt: '2026-08-25T00:00:00.000Z',
  });
  assert.equal(result.details.length, 0);
  assert.deepEqual(result.diagnostics.unclassified, ['new-page']);
});
