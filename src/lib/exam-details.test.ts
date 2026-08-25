import test from 'node:test';
import assert from 'node:assert/strict';
import { activeFormat, countLabel, durationLabel, formatDurationLabel, modeLabel, scoreLabel } from './exam-details.ts';
import type { AssessmentFormat } from '../types.ts';

const format = (effectiveFrom: string, effectiveTo?: string): AssessmentFormat => ({
  effectiveFrom, ...(effectiveTo ? { effectiveTo } : {}), checkedAt: '2026-08-20',
  sourceUrl: 'https://example.com', stages: [{ id: 'one', name: '시험', sections: [{ name: '과목' }] }],
});

test('조회일에 적용되는 가장 최신 시험 구성을 고른다', () => {
  assert.equal(activeFormat([format('2024-01-01', '2026-01-20'), format('2026-01-21')], '2026-08-20')?.effectiveFrom, '2026-01-21');
});

test('공식 적용 시작일을 밝히지 않은 단일 현행 구성도 선택한다', () => {
  const current = format('2026-01-01');
  delete current.effectiveFrom;
  assert.equal(activeFormat([current], '2026-08-20'), current);
});

test('표준시간을 읽기 쉬운 시간제로 표시한다', () => {
  assert.equal(durationLabel(150), '2시간 30분');
  assert.equal(durationLabel({ min: 120, max: 150 }), '2시간~2시간 30분');
  assert.equal(durationLabel(undefined), '공식 안내 없음');
});

test('시험 한눈에 시간에는 과목·문항 수를 섞지 않는다', () => {
  const staged = format('2026-01-01');
  staged.summary = '필기 5과목·100문항·150분 · 실기 150분';
  staged.stages = [
    { id: 'written', name: '필기시험', durationMinutes: 150, sections: [{ name: '과목' }] },
    { id: 'practical', name: '실기시험', durationMinutes: 150, sections: [{ name: '실무' }] },
  ];
  staged.totalDurationMinutes = 300;
  assert.equal(formatDurationLabel(staged), '필기 2시간 30분 · 실기 2시간 30분');
});

test('단계명과 시험시간 사이 공백은 하나만 둔다', () => {
  const format = {
    checkedAt: '2026-08-25', sourceUrl: 'https://example.com',
    stages: [
      { id: 'first', name: '1차 시험', durationMinutes: 100, sections: [{ name: '전체' }] },
      { id: 'second', name: '2차 시험', durationMinutes: 100, sections: [{ name: '전체' }] },
    ],
  };
  assert.equal(formatDurationLabel(format), '1차 1시간 40분 · 2차 1시간 40분');
});

test('고정·가변 문항 수와 응시 방식을 표시한다', () => {
  assert.equal(countLabel(20), '20문항');
  assert.equal(countLabel({ max: 50 }), '최대 50문항');
  assert.equal(modeLabel('computer-task'), '컴퓨터 기반');
  assert.equal(scoreLabel({ min: 0, max: 100 }), '100점 만점');
});
