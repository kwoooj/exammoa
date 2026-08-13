// node --test src/lib/freshness.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MetaFile, SourceHealth } from '../types.ts';
import { STALE_WARN_DAYS, agoLabel, daysSince, freshnessOf, limitOf } from './freshness.ts';

const TODAY = '2026-08-13';

const src = (over: Partial<SourceHealth> = {}): SourceHealth => ({
  health: 'ok', method: 'crawl', fetchedAt: `${TODAY}T00:00:00.000Z`, sessionCount: 5, ...over,
});

const meta = (sources: Record<string, SourceHealth>): MetaFile =>
  ({ fetchedAt: `${TODAY}T07:00:00.000Z`, sources } as unknown as MetaFile);

// ---- daysSince / agoLabel ---------------------------------------------

test('며칠 전인지 센다', () => {
  assert.equal(daysSince('2026-08-13T00:00:00.000Z', TODAY), 0);
  assert.equal(daysSince('2026-08-12T23:59:00.000Z', TODAY), 1);
  assert.equal(daysSince('2026-01-06T00:00:00.000Z', TODAY), 219);
});

test('확인된 적 없으면 null', () => {
  assert.equal(daysSince(null, TODAY), null);
  assert.equal(daysSince('언젠가', TODAY), null);
  assert.equal(agoLabel(null), '확인된 적 없음');
});

test('라벨', () => {
  assert.equal(agoLabel(0), '오늘');
  assert.equal(agoLabel(1), '어제');
  assert.equal(agoLabel(219), '219일 전');
  assert.equal(agoLabel(-1), '오늘', '시계가 어긋나도 미래로 말하지 않는다');
});

// ---- 소스별 임계 -------------------------------------------------------

test('임계를 선언하지 않으면 기본값', () => {
  assert.equal(limitOf(src()), STALE_WARN_DAYS);
  assert.equal(limitOf(src({ staleAfterDays: 400 })), 400);
});

test('연 1회 소스가 219일 됐어도 경고하지 않는다 — 이게 그 소스의 정상이다', () => {
  const f = freshnessOf(meta({
    qnet: src({ method: 'api' }),
    'dataq-csv': src({ method: 'csv', fetchedAt: '2026-01-06T00:00:00.000Z', staleAfterDays: 400 }),
  }), TODAY);
  assert.equal(f.overdue.length, 0);
  assert.equal(f.warn, false, '거짓 경고가 상시로 떠 있으면 진짜 경고를 아무도 읽지 않는다');
  assert.equal(f.message, null);
});

test('자기 임계를 넘기면 경고한다', () => {
  const f = freshnessOf(meta({
    'dataq-csv': src({ method: 'csv', fetchedAt: '2025-01-06T00:00:00.000Z', staleAfterDays: 400 }),
  }), TODAY);
  assert.equal(f.overdue.length, 1, '연 1회 수기 갱신을 아무도 하지 않은 상태다');
  assert.equal(f.warn, true);
  assert.match(f.message!, /dataq-csv/);
});

test('매일 도는 소스는 3일이면 경고한다', () => {
  const f = freshnessOf(meta({ toeic: src({ fetchedAt: '2026-08-10T00:00:00.000Z' }) }), TODAY);
  assert.equal(f.overdue.length, 1);
  assert.equal(f.warn, true);
});

test('2일 된 것은 통과한다', () => {
  const f = freshnessOf(meta({ toeic: src({ fetchedAt: '2026-08-11T00:00:00.000Z' }) }), TODAY);
  assert.equal(f.warn, false);
});

// ---- 실패한 소스 ------------------------------------------------------

test('실패한 소스가 있으면 그 얘기를 먼저 한다', () => {
  const f = freshnessOf(meta({
    qnet: src({ health: 'stale', fetchedAt: '2026-08-13T00:00:00.000Z', reason: '거절 22' }),
    'dataq-csv': src({ method: 'csv', fetchedAt: '2026-01-06T00:00:00.000Z', staleAfterDays: 400 }),
  }), TODAY);
  assert.equal(f.unhealthy.length, 1);
  assert.equal(f.warn, true);
  assert.match(f.message!, /가져오지 못한/);
});

test('실패한 소스는 overdue 로 이중 집계하지 않는다', () => {
  const f = freshnessOf(meta({
    qnet: src({ health: 'stale', fetchedAt: '2026-06-01T00:00:00.000Z' }),
  }), TODAY);
  assert.equal(f.unhealthy.length, 1);
  assert.equal(f.overdue.length, 0, '같은 소스를 두 번 경고하면 문장이 겹친다');
});

test('확인된 적 없는 소스가 있으면 최악을 알 수 없다', () => {
  const f = freshnessOf(meta({
    qnet: src(),
    ghost: src({ health: 'failed', fetchedAt: null }),
  }), TODAY);
  assert.equal(f.worstDays, null);
  assert.equal(f.warn, true);
});

// ---- worstDays --------------------------------------------------------

test('worstDays 는 가장 오래된 소스다 — 경고 판정에는 쓰지 않는다', () => {
  const f = freshnessOf(meta({
    qnet: src(),
    'dataq-csv': src({ method: 'csv', fetchedAt: '2026-01-06T00:00:00.000Z', staleAfterDays: 400 }),
  }), TODAY);
  assert.equal(f.worstDays, 219, '푸터에 표시할 값이다');
  assert.equal(f.warn, false, '표시는 하되 경고는 아니다');
});

test('소스가 없으면 최악을 알 수 없다', () => {
  const f = freshnessOf(meta({}), TODAY);
  assert.equal(f.worstDays, null);
  assert.equal(f.warn, true);
});
