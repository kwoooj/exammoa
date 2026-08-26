import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [detailSeed, feeSeed, sourceSeed] = await Promise.all([
  readFile('data/exam-details.seed.json', 'utf8').then(JSON.parse),
  readFile('data/fees.seed.json', 'utf8').then(JSON.parse),
  readFile('data/detail-sources.seed.json', 'utf8').then(JSON.parse),
]);
const slugs = ['HSK-1', 'HSK-2', 'HSK-3', 'HSK-4', 'HSK-5', 'HSK-6', 'HSK-7-9'];
const detailFor = slug => detailSeed.details.find(detail => detail.examSlug === slug);
const feeFor = slug => feeSeed.fees.find(fee => fee.slug === slug);

test('HSK 1~6급은 개인정보 작성 시간을 제외한 현행 공식 문항 수와 시험시간을 제공한다', () => {
  const totals = [40, 60, 80, 100, 100, 101];
  const durations = [35, 50, 85, 100, 120, 135];
  slugs.slice(0, 6).forEach((slug, index) => {
    const detail = detailFor(slug);
    const stage = detail.formats[0].stages[0];
    assert.equal(stage.totalItemCount, totals[index]);
    assert.equal(stage.durationMinutes, durations[index]);
    assert.equal(detail.formats[0].totalDurationMinutes, durations[index]);
    assert.equal(stage.timedBlocks.reduce((sum, block) => sum + block.durationMinutes, 0), durations[index]);
    assert.match(stage.note, /개인정보 작성 5분은 시험시간에서 제외/);
    assert.match(stage.note, /별도 회차/);
    assert.equal(detail.result.validityLabel, '시험일로부터 2년');
  });
});

test('HSK 7~9급은 통합시험 98문항·약 210분과 IRT 등급 판정을 제공한다', () => {
  const detail = detailFor('HSK-7-9');
  const stage = detail.formats[0].stages[0];
  assert.equal(stage.totalItemCount, 98);
  assert.equal(stage.durationMinutes, 210);
  assert.deepEqual(stage.sections.map(section => section.itemCount), [40, 47, 2, 4, 5]);
  assert.deepEqual(stage.timedBlocks.map(block => block.durationMinutes), [30, 60, 55, 41, 24]);
  assert.equal(detail.result.type, 'level-awarded');
  assert.equal(detail.result.passCriteria, undefined);
  assert.match(detail.result.note, /IRT/);
  assert.equal(stage.totalScore, undefined);
  assert.deepEqual(detail.sourceRefs, ['hsk-levels-format']);
});

test('HSK 1~6급 국내 지필·IBT 응시료를 구분하고 7~9급은 미공개 금액을 추정하지 않는다', () => {
  const paper = [30000, 40000, 60000, 80000, 100000, 120000];
  const ibt = [35000, 50000, 70000, 90000, 110000, 130000];
  slugs.slice(0, 6).forEach((slug, index) => {
    assert.deepEqual(feeFor(slug).items.map(item => item.amount), [paper[index], ibt[index]]);
  });
  assert.equal(feeFor('HSK-7-9').items[0].amount, undefined);
  assert.match(feeFor('HSK-7-9').items[0].amountLabel, /공식 접수 화면/);
  const source = sourceSeed.sources.find(candidate => candidate.id === 'hsk-levels-format');
  assert.ok(source.sourceUrls.every(url => url.includes('chinesetest.cn') || url.includes('hsk-korea.co.kr')));
});
