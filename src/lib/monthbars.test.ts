// node --test src/lib/monthbars.test.ts
//
// 날짜는 data/published/sessions.json 의 실측값이다. 파일에서 읽지 않는다.
//
// 2026-10 격자는 2026-09-28(월) ~ 2026-11-01(일), 5주 35칸이다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BarEvent } from './monthbars.ts';
import { layoutMonth, summarize } from './monthbars.ts';

const ev = (id: string, start: string, end: string, kind: BarEvent['kind'] = 'exam'): BarEvent =>
  ({ id, start, end, kind, text: id });

const FAR_PAST = '2020-01-01';
const opts = (laneCap = Infinity, today = FAR_PAST) => ({ today, laneCap });

const segsOf = (layout: ReturnType<typeof layoutMonth>, id: string) =>
  layout.weeks.flatMap(w => w.segments).filter(s => s.eventId === id);

const spanSum = (layout: ReturnType<typeof layoutMonth>, id: string) =>
  segsOf(layout, id).reduce((n, s) => n + s.span, 0);

// ---- 격자 창 ----------------------------------------------------------

test('2026-10 격자는 9월 28일에 시작해 11월 1일에 끝난다', () => {
  const l = layoutMonth('2026-10', [], opts());
  assert.deepEqual(l.window, { from: '2026-09-28', to: '2026-11-01' });
  assert.equal(l.weeks.length, 5);
});

test('창에 안 걸치는 이벤트는 세그먼트를 만들지 않는다', () => {
  const l = layoutMonth('2026-10', [ev('a', '2026-12-01', '2026-12-05')], opts());
  assert.deepEqual(l.weeks.flatMap(w => w.segments), []);
  assert.deepEqual(l.foldedIds, []);
});

// ---- 주 쪼개기 --------------------------------------------------------

test('한 주 안에서 끝나면 세그먼트 하나다', () => {
  // 2026-10-19(월) ~ 10-23(금)
  const l = layoutMonth('2026-10', [ev('a', '2026-10-19', '2026-10-23')], opts());
  const segs = segsOf(l, 'a');
  assert.equal(segs.length, 1);
  assert.equal(segs[0]!.colStart, 0);
  assert.equal(segs[0]!.span, 5);
});

test('주 경계를 넘으면 세그먼트가 갈리고 span 합이 보존된다', () => {
  // 실기 원서접수 2026-09-21 ~ 10-19. 격자 창은 09-28 부터라 앞이 잘린다.
  const l = layoutMonth('2026-10', [ev('reg', '2026-09-21', '2026-10-19', 'reg')], opts());
  const segs = segsOf(l, 'reg');
  assert.ok(segs.length > 1);
  // 09-28 ~ 10-19 = 22일
  assert.equal(spanSum(l, 'reg'), 22);
});

test('첫 세그먼트만 왼쪽으로, 끝 세그먼트만 오른쪽으로 이어진다', () => {
  const l = layoutMonth('2026-10', [ev('a', '2026-10-06', '2026-10-20')], opts());
  const segs = segsOf(l, 'a');
  assert.equal(segs.length, 3);
  assert.deepEqual(segs.map(s => s.continuesLeft), [false, true, true]);
  assert.deepEqual(segs.map(s => s.continuesRight), [true, true, false]);
});

test('격자 밖에서 시작하면 첫 세그먼트가 왼쪽으로 이어진다', () => {
  const l = layoutMonth('2026-10', [ev('a', '2026-08-31', '2026-10-15', 'reg')], opts());
  const segs = segsOf(l, 'a');
  assert.equal(segs[0]!.continuesLeft, true);
  assert.equal(segs[0]!.colStart, 0);
  assert.equal(segs[segs.length - 1]!.continuesRight, false);
});

test('격자 양쪽 밖으로 뻗은 막대는 모든 주를 덮는다', () => {
  // hrdk-engineer-master 접수 2026-08-31 ~ 10-15 는 56일짜리다. 실측 최장.
  const l = layoutMonth('2026-09', [ev('long', '2026-08-31', '2026-10-15', 'reg')], opts());
  assert.equal(segsOf(l, 'long').length, l.weeks.length);
  for (const s of segsOf(l, 'long')) {
    if (s.weekIndex > 0) assert.equal(s.continuesLeft, true);
    if (s.weekIndex < l.weeks.length - 1) assert.equal(s.continuesRight, true);
  }
});

test('월요일 시작은 colStart 0, 일요일 끝은 이어지지 않는다', () => {
  // 2026-10-05 는 월요일, 2026-10-11 은 일요일
  const l = layoutMonth('2026-10', [ev('a', '2026-10-05', '2026-10-11')], opts());
  const segs = segsOf(l, 'a');
  assert.equal(segs.length, 1);
  assert.equal(segs[0]!.colStart, 0);
  assert.equal(segs[0]!.span, 7);
  assert.equal(segs[0]!.continuesLeft, false);
  assert.equal(segs[0]!.continuesRight, false);
});

test('하루짜리는 span 1 이고 점으로 표시된다', () => {
  const l = layoutMonth('2026-10', [ev('p', '2026-10-15', '2026-10-15')], opts());
  const segs = segsOf(l, 'p');
  assert.equal(segs.length, 1);
  assert.equal(segs[0]!.span, 1);
  assert.equal(segs[0]!.isPoint, true);
  assert.equal(segs[0]!.continuesLeft, false);
  assert.equal(segs[0]!.continuesRight, false);
});

test('기간 막대는 점이 아니다', () => {
  const l = layoutMonth('2026-10', [ev('r', '2026-10-15', '2026-10-16')], opts());
  assert.equal(segsOf(l, 'r')[0]!.isPoint, false);
});

// ---- 라벨 -------------------------------------------------------------

test('라벨은 이벤트당 정확히 한 번 나온다', () => {
  const l = layoutMonth('2026-10', [ev('a', '2026-10-01', '2026-10-25')], opts());
  assert.equal(segsOf(l, 'a').filter(s => s.showLabel).length, 1);
});

test('시작이 격자 밖이면 첫 주에 라벨을 붙인다', () => {
  // 이게 없으면 이름 없는 줄무늬가 다섯 줄 그어진다.
  const l = layoutMonth('2026-09', [ev('long', '2026-08-31', '2026-10-15', 'reg')], opts());
  const segs = segsOf(l, 'long');
  assert.equal(segs[0]!.showLabel, true);
  assert.equal(segs.filter(s => s.showLabel).length, 1);
});

// ---- 레인 안정성 ------------------------------------------------------

test('주를 넘는 세그먼트는 레인이 같다', () => {
  // 이 성질이 "하나의 막대로 보인다" 의 전부다.
  const l = layoutMonth('2026-10', [
    ev('a', '2026-10-01', '2026-10-25'),
    ev('b', '2026-10-03', '2026-10-20'),
  ], opts());
  for (const id of ['a', 'b']) {
    const lanes = new Set(segsOf(l, id).map(s => s.lane));
    assert.equal(lanes.size, 1, id);
  }
});

test('하루라도 겹치면 다른 레인이다', () => {
  // a.end === b.start 는 겹침이다.
  const l = layoutMonth('2026-10', [
    ev('a', '2026-10-05', '2026-10-10'),
    ev('b', '2026-10-10', '2026-10-15'),
  ], opts());
  assert.notEqual(segsOf(l, 'a')[0]!.lane, segsOf(l, 'b')[0]!.lane);
});

test('안 겹치면 같은 레인을 다시 쓴다', () => {
  const l = layoutMonth('2026-10', [
    ev('a', '2026-10-05', '2026-10-09'),
    ev('b', '2026-10-12', '2026-10-16'),
  ], opts());
  assert.equal(segsOf(l, 'a')[0]!.lane, 0);
  assert.equal(segsOf(l, 'b')[0]!.lane, 0);
});

test('입력 순서를 바꿔도 결과가 똑같다', () => {
  // 흔들리면 사전 렌더한 HTML 과 브라우저 렌더가 어긋난다.
  const events = [
    ev('a', '2026-10-01', '2026-10-10', 'reg'),
    ev('b', '2026-10-05', '2026-10-20'),
    ev('c', '2026-10-05', '2026-10-20', 'result'),
    ev('d', '2026-10-15', '2026-10-15'),
  ];
  const forward = layoutMonth('2026-10', events, opts());
  const backward = layoutMonth('2026-10', [...events].reverse(), opts());
  assert.deepEqual(backward, forward);
});

test('긴 것이 낮은 레인을 가져간다', () => {
  const l = layoutMonth('2026-10', [
    ev('short', '2026-10-05', '2026-10-06'),
    ev('long', '2026-10-05', '2026-10-20'),
  ], opts());
  assert.equal(segsOf(l, 'long')[0]!.lane, 0);
  assert.equal(segsOf(l, 'short')[0]!.lane, 1);
});

test('과거가 미래를 캡에서 밀어내지 않는다', () => {
  // 지난 일정은 숨기지 않고 채도만 낮추므로 입력에 남아 있다. 정렬 1차 키가
  // 없으면 1일에 끝난 접수가 20일의 살아 있는 시험을 밀어낸다.
  // 끝난 접수 셋과 진행 중인 시험 하나가 같은 날짜를 두고 겨룬다. 캡은 2 다.
  const l = layoutMonth('2026-10', [
    ev('past1', '2026-10-01', '2026-10-05', 'reg'),
    ev('past2', '2026-10-01', '2026-10-05', 'reg'),
    ev('past3', '2026-10-01', '2026-10-05', 'reg'),
    ev('live', '2026-10-01', '2026-10-25'),
  ], { today: '2026-10-20', laneCap: 2 });

  assert.ok(!l.foldedIds.includes('live'), '살아 있는 막대가 접혔다');
  assert.equal(segsOf(l, 'live')[0]!.lane, 0, '살아 있는 막대가 첫 레인이 아니다');
  assert.equal(l.foldedIds.length, 2); // 지난 접수 셋 중 둘이 밀린다
});

test('정렬 1차 키가 없다면 이 결과가 뒤집힌다', () => {
  // 위 테스트가 우연히 통과하지 않는지 확인한다. 시작일만으로 정렬하면 past1 이
  // 먼저 오므로(id 순), 과거가 레인 0 을 가져간다.
  const l = layoutMonth('2026-10', [
    ev('past1', '2026-10-01', '2026-10-05', 'reg'),
    ev('live', '2026-10-01', '2026-10-25'),
  ], { today: '2026-10-20', laneCap: 2 });
  assert.equal(segsOf(l, 'live')[0]!.lane, 0);
  assert.equal(segsOf(l, 'past1')[0]!.lane, 1);
});

test('과거·진행 중 표시가 붙는다', () => {
  const l = layoutMonth('2026-10', [
    ev('done', '2026-10-01', '2026-10-05'),
    ev('now', '2026-10-10', '2026-10-20'),
    ev('later', '2026-10-25', '2026-10-28'),
  ], { today: '2026-10-15', laneCap: Infinity });
  assert.equal(segsOf(l, 'done')[0]!.past, true);
  assert.equal(segsOf(l, 'now')[0]!.ongoing, true);
  assert.equal(segsOf(l, 'now')[0]!.past, false);
  assert.equal(segsOf(l, 'later')[0]!.past, false);
  assert.equal(segsOf(l, 'later')[0]!.ongoing, false);
});

// ---- 캡과 접기 --------------------------------------------------------

test('캡을 넘으면 접고 그 날짜에 외 N건이 붙는다', () => {
  const l = layoutMonth('2026-10', [
    ev('a', '2026-10-05', '2026-10-07'),
    ev('b', '2026-10-05', '2026-10-07'),
    ev('c', '2026-10-05', '2026-10-07'),
  ], opts(2));
  assert.equal(l.foldedIds.length, 1);
  const week = l.weeks.find(w => w.overflow.length > 0)!;
  assert.equal(week.overflow.length, 3); // 10-05, 10-06, 10-07
  assert.equal(week.overflow[0]!.count, 1);
  assert.deepEqual(week.overflow[0]!.eventIds, l.foldedIds);
});

test('안 겹치는 날에는 외 N건이 없다', () => {
  const l = layoutMonth('2026-10', [ev('a', '2026-10-05', '2026-10-07')], opts(2));
  assert.deepEqual(l.weeks.flatMap(w => w.overflow), []);
});

test('접힌 막대는 주 중간에서 끊기지 않고 통째로 빠진다', () => {
  // 왜 거기서 멈췄는지 읽을 수 없는 화면을 만들지 않는다.
  const l = layoutMonth('2026-10', [
    ev('a', '2026-10-01', '2026-10-31'),
    ev('b', '2026-10-01', '2026-10-31'),
    ev('c', '2026-10-01', '2026-10-31'),
  ], opts(2));
  assert.equal(l.foldedIds.length, 1);
  assert.equal(segsOf(l, l.foldedIds[0]!).length, 0);
});

test('캡 뒤에도 레인 번호에 구멍이 없다', () => {
  const l = layoutMonth('2026-10', [
    ev('a', '2026-10-05', '2026-10-10'),
    ev('b', '2026-10-05', '2026-10-10'),
    ev('c', '2026-10-05', '2026-10-10'),
    ev('d', '2026-10-05', '2026-10-10'),
  ], opts(2));
  for (const w of l.weeks) {
    const lanes = [...new Set(w.segments.map(s => s.lane))].sort((x, y) => x - y);
    lanes.forEach((lane, i) => assert.equal(lane, i, `주 ${w.weekIndex} 레인에 구멍`));
  }
});

test('laneCount 는 그 주가 실제로 쓴 레인 수다', () => {
  const l = layoutMonth('2026-10', [
    ev('a', '2026-10-05', '2026-10-07'),   // 2주차
    ev('b', '2026-10-05', '2026-10-07'),
    ev('c', '2026-10-19', '2026-10-21'),   // 4주차
  ], opts());
  const busy = l.weeks.find(w => w.segments.some(s => s.eventId === 'a'))!;
  const quiet = l.weeks.find(w => w.segments.some(s => s.eventId === 'c'))!;
  assert.equal(busy.laneCount, 2);
  assert.equal(quiet.laneCount, 1);
});

test('일정이 없는 주는 laneCount 가 0 이다', () => {
  const l = layoutMonth('2026-10', [], opts());
  for (const w of l.weeks) assert.equal(w.laneCount, 0);
});

test('캡이 없으면 아무것도 접지 않는다', () => {
  const many = Array.from({ length: 20 }, (_, i) => ev(`e${i}`, '2026-10-05', '2026-10-10'));
  const l = layoutMonth('2026-10', many, opts());
  assert.deepEqual(l.foldedIds, []);
  assert.equal(l.weeks.find(w => w.laneCount > 0)!.laneCount, 20);
});

test('캡에서 살아남는 순서가 결정적이다', () => {
  const events = [
    ev('late', '2026-10-10', '2026-10-12'),
    ev('early-long', '2026-10-05', '2026-10-20'),
    ev('early-short', '2026-10-05', '2026-10-06'),
  ];
  const a = layoutMonth('2026-10', events, opts(1));
  const b = layoutMonth('2026-10', [...events].reverse(), opts(1));
  assert.deepEqual(a.foldedIds, b.foldedIds);
  assert.deepEqual(a.foldedIds.sort(), ['early-short', 'late']);
});

test('그린 것과 접힌 것을 더하면 창 안의 전체다', () => {
  const events = Array.from({ length: 12 }, (_, i) => ev(`e${i}`, '2026-10-05', '2026-10-12'));
  const l = layoutMonth('2026-10', events, opts(3));
  const drawn = new Set(l.weeks.flatMap(w => w.segments).map(s => s.eventId));
  assert.equal(drawn.size + l.foldedIds.length, events.length);
});

// ---- 월 경계 · 윤년 ---------------------------------------------------

test('격자 첫 주의 지난 달 칸에도 막대를 그린다', () => {
  const l = layoutMonth('2026-10', [ev('a', '2026-09-28', '2026-09-30', 'reg')], opts());
  const segs = segsOf(l, 'a');
  assert.equal(segs.length, 1);
  assert.equal(segs[0]!.weekIndex, 0);
  assert.equal(segs[0]!.colStart, 0);
});

test('2026-02 는 1일이 일요일이라 첫 주 마지막 칸이다', () => {
  const l = layoutMonth('2026-02', [ev('a', '2026-02-01', '2026-02-01')], opts());
  const segs = segsOf(l, 'a');
  assert.equal(segs[0]!.weekIndex, 0);
  assert.equal(segs[0]!.colStart, 6);
});

test('윤년 2월 29일을 하루도 빠뜨리지 않는다', () => {
  const l = layoutMonth('2028-02', [ev('a', '2028-02-25', '2028-03-02')], opts());
  // 2028-02 격자는 2028-01-31 ~ 2028-03-05 이므로 전 구간이 들어온다
  assert.equal(spanSum(l, 'a'), 7);
});

test('연말을 걸치는 막대를 양쪽 달에서 자기 몫만 그린다', () => {
  const e = ev('a', '2026-12-28', '2027-01-05', 'reg');
  const dec = layoutMonth('2026-12', [e], opts());
  const jan = layoutMonth('2027-01', [e], opts());
  // 2026-12 격자 2026-11-30~2027-01-03 / 2027-01 격자 2026-12-28~2027-01-31
  assert.equal(spanSum(dec, 'a'), 7); // 12-28 ~ 01-03
  assert.equal(spanSum(jan, 'a'), 9); // 12-28 ~ 01-05
});

test('어느 달이든 span 합이 창 안의 일수와 같다', () => {
  const months = ['2024-02', '2026-02', '2026-10', '2027-01', '2028-02', '2028-12'];
  for (const m of months) {
    const l = layoutMonth(m, [ev('a', '2020-01-01', '2030-01-01', 'reg')], opts());
    const days = l.weeks.length * 7;
    assert.equal(spanSum(l, 'a'), days, m);
  }
});

// ---- summarize (§5.3-E · §8.9) ----------------------------------------

test('접수는 마감일 하루로 줄인다', () => {
  // 접수는 시작을 놓쳐서 못 보는 게 아니라 마감을 놓쳐서 못 본다.
  const [s] = summarize([ev('reg', '2026-09-21', '2026-10-19', 'reg')]);
  assert.equal(s!.start, '2026-10-19');
  assert.equal(s!.end, '2026-10-19');
});

test('기간 시험은 시작일 하루로 줄인다', () => {
  const [s] = summarize([ev('exam', '2026-10-24', '2026-11-13')]);
  assert.equal(s!.start, '2026-10-24');
  assert.equal(s!.end, '2026-10-24');
});

test('하루짜리 시험은 그대로 둔다', () => {
  const [s] = summarize([ev('one', '2026-02-07', '2026-02-07')]);
  assert.equal(s!.start, '2026-02-07');
  assert.equal(s!.end, '2026-02-07');
});

test('발표는 홈 미리보기에서 뺀다', () => {
  assert.deepEqual(summarize([ev('r', '2026-12-11', '2026-12-11', 'result')]), []);
});

test('요약하면 전부 하루라 레인 수가 곧 그날 건수다', () => {
  const events = [
    ev('a', '2026-10-01', '2026-10-15', 'reg'),
    ev('b', '2026-10-10', '2026-10-15', 'reg'),
    ev('c', '2026-10-15', '2026-10-20'),
  ];
  const l = layoutMonth('2026-10', summarize(events), opts());
  const week = l.weeks.find(w => w.segments.length > 0)!;
  for (const s of week.segments) assert.equal(s.span, 1);
  assert.equal(week.laneCount, 3); // 셋 다 10-15 에 모인다
});

test('요약은 원본을 건드리지 않는다', () => {
  const original = ev('reg', '2026-09-21', '2026-10-19', 'reg');
  summarize([original]);
  assert.equal(original.start, '2026-09-21');
});

// ---- 실측 회귀 (§8.9) -------------------------------------------------

test('붐비는 달도 캡 안에 들어오고 숫자가 맞는다', () => {
  // 2026-10 은 실측 이벤트 120건 / 한 주 최대 39개가 겹친다. 그중 82건이
  // 고빈도 3그룹(toeic-speaking 36 · daily-alt 24 · daily-main 22)에서 온다.
  // 접기 없이 그리면 700px 짜리 주 행이 나와 나머지 달이 화면 밖으로 밀린다.
  const dense: BarEvent[] = [];
  for (let i = 0; i < 40; i++) {
    dense.push(ev(`reg${i}`, `2026-10-${String((i % 20) + 1).padStart(2, '0')}`, `2026-10-${String((i % 20) + 8).padStart(2, '0')}`, 'reg'));
  }
  const l = layoutMonth('2026-10', dense, { today: '2026-10-14', laneCap: 3 });

  for (const w of l.weeks) assert.ok(w.laneCount <= 3, `주 ${w.weekIndex} 레인 ${w.laneCount}`);

  const drawn = new Set(l.weeks.flatMap(w => w.segments).map(s => s.eventId));
  assert.equal(drawn.size + l.foldedIds.length, dense.length);

  // 접힌 것은 전부 어느 날짜의 외 N건에 잡혀 있어야 한다 — 아니면 조용히 사라진 것이다
  const surfaced = new Set(l.weeks.flatMap(w => w.overflow).flatMap(o => o.eventIds));
  assert.deepEqual([...surfaced].sort(), [...l.foldedIds].sort());
});
