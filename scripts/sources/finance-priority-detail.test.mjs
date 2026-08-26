import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const details = JSON.parse(await readFile('data/exam-details.seed.json', 'utf8')).details;
const detail = slug => details.find(candidate => candidate.examSlug === slug);

test('KBI 우선 2종은 공식 부별 시간·배점과 부분합격 기준을 보존한다', () => {
  const credit = detail('신용분석사');
  const fp = detail('자산관리사-FP');
  assert.deepEqual(credit.formats[0].stages.map(stage => stage.durationMinutes), [120, 180]);
  assert.deepEqual(fp.formats[0].stages.map(stage => stage.durationMinutes), [100, 100]);
  assert.match(credit.result.note, /부분합격/);
  assert.equal(credit.classification.kind, 'private-accredited');
  assert.equal(fp.classification.kind, 'private-accredited');
});

test('투자자산운용사는 연속 120분·100문항과 공식 과락 기준을 보존한다', () => {
  const investment = detail('투자자산운용사');
  const stage = investment.formats[0].stages[0];
  assert.equal(stage.durationMinutes, 120);
  assert.equal(stage.totalItemCount, 100);
  assert.deepEqual(stage.sections.map(section => section.itemCount), [20, 30, 50]);
  assert.match(investment.result.passCriteria, /40%.*70%/);
  assert.equal(investment.classification.kind, 'private-registered');
});
