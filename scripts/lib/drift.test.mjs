// node --test scripts/lib/drift.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DROP_RATIO, HISTORY_LIMIT, MIN_SAMPLES,
  appendRun, baselines, detectDrift, median, runRecord,
} from './drift.mjs';

const run = (at, sources) => ({ at, sources });
const s = (sessions, events = sessions * 4) => ({ sessions, events });

// ---- 중위값 -----------------------------------------------------------

test('중위값', () => {
  assert.equal(median([1, 2, 3]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([5]), 5);
  assert.equal(median([]), null);
});

test('숫자가 아닌 값을 무시한다', () => {
  assert.equal(median([1, null, 3, undefined, NaN]), 2);
});

test('이상치 하나에 흔들리지 않는다 — 이게 평균 대신 쓰는 이유다', () => {
  const normal = [6, 6, 6, 6, 6];
  const broken = [6, 6, 0, 6, 6];
  assert.equal(median(normal), 6);
  assert.equal(median(broken), 6, '깨진 하루가 기준선을 끌어내리면 안 된다');
});

// ---- 기준선 -----------------------------------------------------------

test('소스별로 중위값을 낸다', () => {
  const b = baselines([
    run('1', { toeic: s(11), kbs: s(6) }),
    run('2', { toeic: s(11), kbs: s(6) }),
    run('3', { toeic: s(10), kbs: s(6) }),
  ]);
  assert.equal(b.toeic.sessions, 11);
  assert.equal(b.kbs.sessions, 6);
  assert.equal(b.toeic.samples, 3);
});

test('이력이 없으면 빈 기준선', () => {
  assert.deepEqual(baselines([]), {});
  assert.deepEqual(baselines(null), {});
});

// ---- 판정 -------------------------------------------------------------

const base3 = (n) => baselines([run('1', { x: s(n) }), run('2', { x: s(n) }), run('3', { x: s(n) })]).x;

test('평소와 비슷하면 통과', () => {
  assert.equal(detectDrift(s(6), base3(6)).drift, false);
  assert.equal(detectDrift(s(5), base3(6)).drift, false);
});

test('절반 아래로 떨어지면 잡는다 — 개편은 보통 빈 표로 나타난다', () => {
  const v = detectDrift(s(1), base3(6));
  assert.equal(v.drift, true);
  assert.match(v.reason, /회차 1건/);
  assert.match(v.reason, /중위값 6건/);
});

test('0건은 반드시 잡는다 — 조용히 0건을 게시하는 것이 가장 위험한 실패다', () => {
  assert.equal(detectDrift(s(0, 0), base3(6)).drift, true);
});

test('경계', () => {
  const b = base3(10);
  assert.equal(detectDrift(s(5), b).drift, false, `${DROP_RATIO} 배는 통과`);
  assert.equal(detectDrift(s(4), b).drift, true);
});

test('회차는 멀쩡한데 이벤트만 반토막이면 잡는다 — 컬럼 하나가 사라진 경우다', () => {
  const b = base3(6); // events 24
  const v = detectDrift({ sessions: 6, events: 6 }, b);
  assert.equal(v.drift, true);
  assert.match(v.reason, /이벤트/);
});

test('완만한 감소는 통과한다 — 토익은 지난 회차를 내린다', () => {
  // 45 → 44 → 43 ... 중위값이 따라간다
  const b = baselines([run('1', { x: s(45) }), run('2', { x: s(44) }), run('3', { x: s(43) })]).x;
  assert.equal(detectDrift(s(42), b).drift, false);
});

// ---- 기준선이 부족할 때 -------------------------------------------------

test('이력이 모자라면 판정하지 않는다 — 새 소스를 첫날부터 실패시키지 않는다', () => {
  assert.equal(MIN_SAMPLES, 3);
  const thin = baselines([run('1', { x: s(6) }), run('2', { x: s(6) })]).x;
  assert.equal(thin.samples, 2);
  assert.equal(detectDrift(s(0, 0), thin).drift, false, '표본 2개로는 0건도 판정하지 않는다');
});

test('기준선이 아예 없으면 통과', () => {
  assert.equal(detectDrift(s(0, 0), undefined).drift, false);
});

test('기준선이 0 이면 비교하지 않는다 — 0 의 절반은 0 이라 항상 걸린다', () => {
  const b = baselines([run('1', { x: s(0, 0) }), run('2', { x: s(0, 0) }), run('3', { x: s(0, 0) })]).x;
  assert.equal(detectDrift(s(0, 0), b).drift, false);
});

// ---- 이력 쌓기 --------------------------------------------------------

test('성공한 소스만 담는다 — 계승 값이 섞이면 기준선이 무뎌진다', () => {
  const rec = runRecord([
    { id: 'toeic', ok: true, sessions: [{ events: [1, 2] }, { events: [3] }] },
    { id: 'qnet', ok: false, sessions: [{ events: [1] }] },
  ], '2026-08-14T00:00:00.000Z');
  assert.deepEqual(Object.keys(rec.sources), ['toeic']);
  assert.deepEqual(rec.sources.toeic, { sessions: 2, events: 3 });
});

test('이력이 한도를 넘으면 오래된 것부터 버린다', () => {
  let h = { runs: [] };
  for (let i = 0; i < HISTORY_LIMIT + 5; i++) h = appendRun(h, run(String(i), { x: s(6) }));
  assert.equal(h.runs.length, HISTORY_LIMIT);
  assert.equal(h.runs[0].at, '5', '가장 오래된 5개가 빠진다');
  assert.equal(h.runs.at(-1).at, String(HISTORY_LIMIT + 4));
});

test('빈 이력에서 시작할 수 있다', () => {
  assert.equal(appendRun(null, run('1', {})).runs.length, 1);
});

// ---- 실제 시나리오 -----------------------------------------------------

test('실측 시나리오 — 전산세무회계 표가 빈 표로 바뀐 날', () => {
  // 6회차를 6일 받다가 어느 날 0건
  const history = { runs: Array.from({ length: 6 }, (_, i) => run(`d${i}`, { 'kacpta-tax': s(6, 18) })) };
  const b = baselines(history.runs);
  const verdict = detectDrift({ sessions: 0, events: 0 }, b['kacpta-tax']);
  assert.equal(verdict.drift, true, '헤더는 그대로인데 행만 사라지면 파서는 성공적으로 0건을 준다');
});

test('직전이 깨져 있어도 기준선이 살아 있다 — 이게 중위값을 쓰는 이유다', () => {
  // 6,6,6,6 정상 → 하루 0건(놓쳤다고 치자) → 다음 날도 0건
  const runs = [
    run('1', { x: s(6) }), run('2', { x: s(6) }), run('3', { x: s(6) }),
    run('4', { x: s(6) }), run('5', { x: s(0, 0) }),
  ];
  const b = baselines(runs).x;
  assert.equal(b.sessions, 6, '직전 1회와 비교했다면 0 이 정상으로 승격됐을 것이다');
  assert.equal(detectDrift(s(0, 0), b).drift, true);
});
