import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverageLine, coverageProblem, sourceCoverage } from './source-coverage.mjs';

test('원본과 포함 목록이 같으면 전수 분류다', () => {
  const result = sourceCoverage({ discovered: ['A', 'B'], included: ['B', 'A'], expected: ['A', 'B'] });
  assert.deepEqual(result, { discovered: 2, included: 2, unclassified: [], missing: [] });
  assert.equal(coverageProblem(result), null);
  assert.equal(coverageLine(result), '원본 2종 · 포함 2종 · 미분류 0종');
});

test('새 코드와 사라진 예정 코드를 동시에 진단한다', () => {
  const result = sourceCoverage({
    discovered: ['A', 'NEW'], included: ['A'], expected: ['A', 'B'], labels: { NEW: '새 시험' },
  });
  assert.deepEqual(result.unclassified, ['NEW:새 시험']);
  assert.deepEqual(result.missing, ['B']);
  assert.match(coverageProblem(result), /미분류 NEW:새 시험/);
  assert.match(coverageProblem(result), /원본에서 누락 B/);
});

test('중복 회차는 종목 수를 부풀리지 않는다', () => {
  const result = sourceCoverage({ discovered: ['A', 'A', 'B'], included: ['A', 'A', 'B'] });
  assert.equal(result.discovered, 2);
  assert.equal(result.included, 2);
});
