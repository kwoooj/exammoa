import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qnetEventTiming } from './event-timing.mjs';

test('Q-Net 접수와 발표 공통 시각을 보존한다', () => {
  assert.deepEqual(qnetEventTiming('reg'), {
    start: '10:00', end: '18:00', timezone: 'Asia/Seoul', status: 'confirmed',
  });
  assert.deepEqual(qnetEventTiming('result'), {
    start: '09:00', timezone: 'Asia/Seoul', status: 'confirmed',
  });
});

test('Q-Net 시험 시각은 지어내지 않고 수험표 확인 상태로 둔다', () => {
  assert.deepEqual(qnetEventTiming('exam'), {
    timezone: 'Asia/Seoul', status: 'varies', note: '접수한 시험장·일시에 따라 다름 · 수험표 확인',
  });
});

