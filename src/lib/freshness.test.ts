// node --test src/lib/freshness.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MetaFile, SourceHealth } from '../types.ts';
import { STALE_WARN_DAYS, agoLabel, daysSince, freshnessOf, freshnessOfSource, limitOf } from './freshness.ts';

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
  assert.equal(agoLabel(null), '기록 없음');
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

// ---- 항목 단위 신선도 (§2.4) -------------------------------------------

test('소스 하나의 나이를 그 자리에서 말한다', () => {
  // 전체 경고만 있으면 토익 하나가 낡았을 때 배너가 뜨고 62종목이 전부
  // 의심스러워 보인다. 낡은 것이 무엇인지 그 자리에서 말해야 한다.
  const m = meta({
    qnet: { health: 'ok', method: 'api', fetchedAt: '2026-08-14T00:00:00.000Z', sessionCount: 102 },
    toeic: { health: 'ok', method: 'crawl', fetchedAt: '2026-08-09T00:00:00.000Z', sessionCount: 11 },
  });
  assert.equal(freshnessOfSource(m, 'qnet', '2026-08-14').label, '마지막 확인 오늘');
  assert.equal(freshnessOfSource(m, 'toeic', '2026-08-14').label, '마지막 확인 5일 전');
});

test('소스가 자기 주기를 넘겼을 때만 overdue 다', () => {
  const m = meta({
    // 연 1회 발행되는 CSV. 219일이 이 소스의 정상 상태다.
    'dataq-csv': { health: 'ok', method: 'csv', fetchedAt: '2026-01-06T00:00:00.000Z', sessionCount: 10, staleAfterDays: 400 },
    toeic: { health: 'ok', method: 'crawl', fetchedAt: '2026-08-09T00:00:00.000Z', sessionCount: 11 },
  });
  assert.equal(freshnessOfSource(m, 'dataq-csv', '2026-08-14').overdue, false);
  assert.equal(freshnessOfSource(m, 'toeic', '2026-08-14').overdue, true);
});

test('실패한 소스를 낡음과 구분한다', () => {
  const m = meta({
    toeic: { health: 'failed', method: 'crawl', fetchedAt: '2026-08-13T00:00:00.000Z', sessionCount: 11, reason: 'fetch failed' },
  });
  const f = freshnessOfSource(m, 'toeic', '2026-08-14');
  assert.equal(f.failed, true);
  assert.equal(f.overdue, false);
});

test('출처를 모르면 전체 수집 시각으로 답한다', () => {
  // 모른다고 침묵하면 화면이 "최종 확인" 을 아예 못 쓴다.
  const m = meta({ qnet: { health: 'ok', method: 'api', fetchedAt: '2026-08-12T00:00:00.000Z', sessionCount: 102 } });
  const f = freshnessOfSource(m, undefined, '2026-08-14');
  assert.equal(f.label, '마지막 확인 어제');
  assert.equal(f.failed, false);
});

test('모르는 소스 id 에도 죽지 않는다', () => {
  const m = meta({ qnet: { health: 'ok', method: 'api', fetchedAt: '2026-08-14T00:00:00.000Z', sessionCount: 102 } });
  assert.doesNotThrow(() => freshnessOfSource(m, '없는소스', '2026-08-14'));
});
