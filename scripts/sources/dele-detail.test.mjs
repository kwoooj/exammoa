import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [detailsSeed, feesSeed, sourcesSeed] = await Promise.all([
  readFile('data/exam-details.seed.json', 'utf8').then(JSON.parse),
  readFile('data/fees.seed.json', 'utf8').then(JSON.parse),
  readFile('data/detail-sources.seed.json', 'utf8').then(JSON.parse),
]);
const slugs = ['DELE-A1', 'DELE-A2', 'DELE-B1', 'DELE-B2', 'DELE-C1', 'DELE-C2'];
const detailFor = slug => detailsSeed.details.find(detail => detail.examSlug === slug);
const feeFor = slug => feesSeed.fees.find(fee => fee.slug === slug);

test('DELE A1~C2는 공식 필기·구술 시간과 준비시간을 구분한다', () => {
  const expected = [[95, 10], [145, 12], [170, 15], [190, 20], [220, 20], [255, 20]];
  slugs.forEach((slug, index) => {
    const format = detailFor(slug).formats[0];
    assert.deepEqual(format.stages.map(stage => stage.durationMinutes), expected[index]);
    assert.equal(format.totalDurationMinutes, expected[index][0] + expected[index][1]);
    assert.match(format.stages[1].note, /준비시간/);
    assert.equal(detailFor(slug).result.validityLabel, '유효기간 없음');
  });
});

test('DELE 평가 그룹과 C2 독립 과락 기준을 구분한다', () => {
  for (const slug of slugs.slice(0, 5)) assert.match(detailFor(slug).result.passCriteria, /두 평가 그룹 각각 30점/);
  const c2 = detailFor('DELE-C2');
  assert.match(c2.result.passCriteria, /3개 시험 각각 20점/);
  assert.deepEqual(c2.formats[0].stages[0].sections.map(section => section.scoreRange.max), [33.33, 33.33]);
  assert.equal(c2.formats[0].stages[1].sections[0].scoreRange.max, 33.34);
  assert.equal(c2.formats[0].stages[0].sections[0].itemCount, 52);
  assert.equal(c2.formats[0].stages[0].sections[0].taskCount, undefined);
});

test('주한 세르반테스 문화원 2026년 공식 응시료를 급수별로 저장한다', () => {
  const expected = [166000, 215600, 260000, 285000, 325000, 348000];
  slugs.forEach((slug, index) => {
    const fee = feeFor(slug);
    assert.equal(fee.items[0].amount, expected[index]);
    assert.equal(fee.checkedAt, '2026-08-26');
    assert.match(fee.source.url, /seul\.cervantes\.es/);
  });
  const source = sourcesSeed.sources.find(candidate => candidate.id === 'dele-levels-format');
  assert.equal(source.examSlugs.length, 6);
  assert.ok(source.sourceUrls.every(url => url.includes('cervantes.es')));
});
