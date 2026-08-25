import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [detailSeed, feeSeed] = await Promise.all([
  readFile('data/exam-details.seed.json', 'utf8').then(JSON.parse),
  readFile('data/fees.seed.json', 'utf8').then(JSON.parse),
]);
const detailFor = slug => detailSeed.details.find(detail => detail.examSlug === slug);
const feeFor = slug => feeSeed.fees.find(fee => fee.slug === slug);

test('TOEFL iBT는 2026년 개편 형식과 새 1~6 점수 척도를 제공한다', () => {
  const detail = detailFor('TOEFL-iBT');
  const format = detail.formats[0];
  const stage = format.stages[0];
  assert.equal(format.effectiveFrom, '2026-01-21');
  assert.equal(format.totalDurationMinutes, 90);
  assert.equal(stage.totalItemCount, 120);
  assert.deepEqual(stage.sections.map(section => section.itemCount), [50, 47, 12, 11]);
  assert.deepEqual(stage.timedBlocks.map(block => block.durationMinutes), [30, 29, 23, 8]);
  assert.equal(stage.timedBlocks.reduce((sum, block) => sum + block.durationMinutes, 0), stage.durationMinutes);
  assert.match(detail.result.label, /1~6점/);
  assert.doesNotMatch(detail.result.label, /0~120점/);
  assert.match(stage.note, /적응형/);
});

test('IELTS 두 모듈은 공통 강제 시간과 서로 다른 읽기·쓰기 구성을 보존한다', () => {
  const academic = detailFor('IELTS-Academic');
  const general = detailFor('IELTS-General-Training');
  for (const detail of [academic, general]) {
    assert.deepEqual(detail.formats[0].totalDurationMinutes, { min: 161, max: 164 });
    assert.equal(detail.formats[0].stages.length, 1);
    assert.deepEqual(detail.formats[0].stages[0].sections.slice(0, 2).map(section => section.itemCount), [40, 40]);
    assert.deepEqual(detail.formats[0].stages[0].timedBlocks.map(block => block.durationMinutes), [30, 60, 60, { min: 11, max: 14 }]);
    assert.match(detail.result.label, /0~9 Band/);
    assert.equal(feeFor(detail.examSlug).items[0].amount, 347000);
  }
  assert.equal(academic.formats[0].stages[0].sections[1].name, 'Academic Reading');
  assert.equal(general.formats[0].stages[0].sections[1].name, 'General Training Reading');
  assert.notEqual(academic.formats[0].stages[0].sections[2].name, general.formats[0].stages[0].sections[2].name);
});

test('TOEFL 위치별 가변 응시료는 숫자를 추정하지 않는다', () => {
  const fee = feeFor('TOEFL-iBT');
  assert.equal(fee.items[0].amount, undefined);
  assert.match(fee.items[0].amountLabel, /접수 국가 선택/);
  assert.equal(fee.checkedAt, '2026-08-25');
});
