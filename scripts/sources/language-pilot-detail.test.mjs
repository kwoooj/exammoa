import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const details = JSON.parse(await readFile('data/exam-details.seed.json', 'utf8')).details;
const detailFor = slug => details.find(detail => detail.examSlug === slug);

test('New TEPS는 135문항·105분과 공식 강제 시간 두 구간만 제공한다', () => {
  const detail = detailFor('New-TEPS');
  const stage = detail.formats[0].stages[0];
  assert.equal(detail.classification.kind, 'private-accredited');
  assert.equal(stage.totalItemCount, 135);
  assert.equal(stage.totalScore, 600);
  assert.deepEqual(stage.sections.map(section => section.itemCount), [40, 30, 30, 35]);
  assert.deepEqual(stage.sections.map(section => section.scoreRange.max), [240, 60, 60, 240]);
  assert.deepEqual(stage.timedBlocks.map(block => block.durationMinutes), [40, 65]);
  assert.equal(stage.timedBlocks.reduce((sum, block) => sum + block.durationMinutes, 0), stage.durationMinutes);
});

test('G-TELP Level 2는 세 강제 구간과 영역별 100점 체계를 제공한다', () => {
  const detail = detailFor('G-TELP-Level-2');
  const stage = detail.formats[0].stages[0];
  assert.equal(detail.classification.kind, 'international-assessment');
  assert.equal(stage.totalItemCount, 80);
  assert.deepEqual(stage.sections.map(section => section.itemCount), [26, 26, 28]);
  assert.deepEqual(stage.sections.map(section => section.scoreRange.max), [100, 100, 100]);
  assert.deepEqual(stage.timedBlocks.map(block => block.durationMinutes), [20, 30, 40]);
  assert.equal(stage.timedBlocks.reduce((sum, block) => sum + block.durationMinutes, 0), stage.durationMinutes);
});

test('OPIc은 오리엔테이션을 제외한 본시험 40분과 가변 문항 수만 제공한다', () => {
  const detail = detailFor('오픽');
  const format = detail.formats[0];
  const stage = format.stages[0];
  assert.equal(detail.result.type, 'level-awarded');
  assert.equal(format.totalDurationMinutes, 40);
  assert.deepEqual(stage.totalItemCount, { min: 12, max: 15 });
  assert.equal(stage.sections[0].mode, 'recorded-response');
  assert.equal(stage.timedBlocks, undefined);
  assert.match(format.note, /오리엔테이션은 본시험 40분에 포함하지 않습니다/);
});
