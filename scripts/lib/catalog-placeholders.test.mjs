import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogPlaceholderSessions } from './catalog-placeholders.mjs';

test('수집기 연결 전 수동 시험은 날짜를 만들지 않고 미공고로 노출한다', () => {
  const sessions = catalogPlaceholderSessions(
    [{ slug: 'New-TEPS', groupId: 'new-teps', collect: 'manual' }],
    [{ id: 'new-teps', cadence: 'periodic' }],
    2026,
  );
  assert.deepEqual(sessions, [{
    id: 'new-teps-2026-tbd', groupId: 'new-teps', year: 2026, seq: null,
    label: '2026년 일정 미공고', mode: 'scheduled', status: 'tbd', scheduleState: 'import-pending', events: [],
  }]);
});

test('상시시험과 비공개 none 그룹을 미공고로 중복 생성하지 않는다', () => {
  const sessions = catalogPlaceholderSessions(
    [
      { slug: 'TOEFL', groupId: 'toefl', collect: 'manual', rolling: true },
      { slug: '보류', groupId: 'held', collect: 'none' },
    ],
    [
      { id: 'toefl', cadence: 'rolling' },
      { id: 'held', cadence: 'periodic' },
    ],
    2026,
  );
  assert.deepEqual(sessions, []);
});
