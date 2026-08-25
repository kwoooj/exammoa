import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [detailSeed, feeSeed, sourceSeed] = await Promise.all([
  readFile('data/exam-details.seed.json', 'utf8').then(JSON.parse),
  readFile('data/fees.seed.json', 'utf8').then(JSON.parse),
  readFile('data/detail-sources.seed.json', 'utf8').then(JSON.parse),
]);
const slugs = ['JLPT-N1', 'JLPT-N2', 'JLPT-N3', 'JLPT-N4', 'JLPT-N5'];
const detailFor = slug => detailSeed.details.find(detail => detail.examSlug === slug);
const feeFor = slug => feeSeed.fees.find(fee => fee.slug === slug);

test('JLPT N1~N5는 현행 공식 강제 시험시간과 총점을 제공한다', () => {
  const durations = [165, 155, 140, 115, 90];
  const blocks = [[110, 55], [105, 50], [30, 70, 40], [25, 55, 35], [20, 40, 30]];
  slugs.forEach((slug, index) => {
    const detail = detailFor(slug);
    const format = detail.formats[0];
    const stage = format.stages[0];
    assert.equal(format.totalDurationMinutes, durations[index]);
    assert.equal(stage.durationMinutes, durations[index]);
    assert.equal(stage.totalScore, 180);
    assert.deepEqual(stage.timedBlocks.map(block => block.durationMinutes), blocks[index]);
    assert.equal(stage.timedBlocks.reduce((sum, block) => sum + block.durationMinutes, 0), durations[index]);
    assert.equal(detail.result.validityLabel, '유효기간 없음');
    assert.deepEqual(detail.sourceRefs, ['jlpt-levels-format']);
  });
});

test('공식 고정 문항 수가 없는 JLPT는 준비 서비스 값으로 추정하지 않는다', () => {
  for (const slug of slugs) {
    const stage = detailFor(slug).formats[0].stages[0];
    assert.equal(stage.totalItemCount, undefined);
    assert.ok(stage.sections.every(section => section.itemCount === undefined && section.taskCount === undefined));
    assert.match(stage.note, /문항 수를 추정하지 않습니다/);
  }
  const source = sourceSeed.sources.find(candidate => candidate.id === 'jlpt-levels-format');
  assert.ok(source.sourceUrls.every(url => url.includes('jlpt.jp') || url.includes('bsjlpt.or.kr')));
});

test('JLPT 합격 기준과 2026년 국내 접수료를 급수별로 구분한다', () => {
  assert.match(detailFor('JLPT-N1').result.passCriteria, /총점 100점/);
  assert.match(detailFor('JLPT-N3').result.passCriteria, /총점 95점/);
  assert.match(detailFor('JLPT-N5').result.passCriteria, /총점 80점/);
  for (const slug of slugs.slice(0, 3)) {
    assert.deepEqual(feeFor(slug).items.map(item => item.amount), [75000, 82500]);
  }
  for (const slug of slugs.slice(3)) {
    assert.deepEqual(feeFor(slug).items.map(item => item.amount), [60000, 66000]);
  }
});
