// node --test src/lib/timeline.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ExamPlan, ScheduleGroup, Session } from '../types.ts';
import { DENSE_THRESHOLD, buildRows, clip, monthTicks, timelineWindow, todayLeft } from './timeline.ts';

const TODAY = '2026-08-13';
const w = timelineWindow(TODAY); // 2026-08-13 ~ 2027-02-13

const ev = (kind: 'reg' | 'exam' | 'result', phase: 'written' | 'practical' | 'single',
  start: string, end: string, seq = 1, label = '') => ({ kind, phase, start, end, seq, label, note: null });

const group = (id: string, cadence: ScheduleGroup['cadence'] = 'periodic'): ScheduleGroup => ({
  id, name: id, agency: '한국산업인력공단', cadence, examSlugs: [],
});

const hrdk: Session = {
  id: 'hrdk-regular-2026-3', groupId: 'hrdk-regular', year: 2026, seq: 3, label: null,
  mode: 'scheduled', status: 'confirmed',
  events: [
    ev('reg', 'written', '2026-07-20', '2026-07-23', 1, '필기 원서접수'),
    ev('exam', 'written', '2026-08-07', '2026-09-01', 1, '필기시험'),
    ev('result', 'written', '2026-09-09', '2026-09-09', 1, '필기 합격발표'),
    ev('reg', 'practical', '2026-09-21', '2026-10-19', 1, '실기 원서접수'),
    ev('exam', 'practical', '2026-10-24', '2026-11-13', 1, '실기시험'),
    ev('result', 'practical', '2026-12-11', '2026-12-11', 1, '최종 합격발표'),
  ],
};

const nameOf = (s: string) => ({ 정보처리기사: '정처기', 위험물산업기사: '위산기' }[s] ?? s);

// ---- 창 ---------------------------------------------------------------

test('창은 오늘부터 6개월', () => {
  assert.equal(w.from, TODAY);
  assert.equal(w.to, '2027-02-13');
});

// ---- 클리핑 -----------------------------------------------------------

test('창 안의 구간은 0~1 좌표가 된다', () => {
  const c = clip('2026-08-13', '2026-08-13', w)!;
  assert.equal(c.left, 0);
  assert.ok(c.width > 0 && c.width < 0.02, `하루는 아주 좁아야 한다 (실제 ${c.width})`);
});

test('창 앞에서 시작해 안으로 들어오는 구간은 왼쪽이 잘린다', () => {
  // 필기시험 08-07~09-01. 창은 08-13 시작
  const c = clip('2026-08-07', '2026-09-01', w)!;
  assert.equal(c.left, 0, '창 시작보다 앞이면 left 는 0');
  assert.ok(c.width > 0);
});

test('창을 넘어가는 구간은 오른쪽이 잘린다', () => {
  const c = clip('2027-01-01', '2027-12-31', w)!;
  assert.ok(c.left + c.width <= 1 + 1e-9, `창을 넘어서면 안 된다 (실제 ${c.left + c.width})`);
});

test('창과 겹치지 않으면 null', () => {
  assert.equal(clip('2026-01-01', '2026-02-01', w), null);
  assert.equal(clip('2028-01-01', '2028-02-01', w), null);
});

test('창 경계에 딱 걸치면 그린다', () => {
  assert.notEqual(clip('2026-01-01', TODAY, w), null);
  assert.notEqual(clip('2027-02-13', '2027-12-31', w), null);
});

test('모든 막대가 0~1 안에 있다', () => {
  for (const [s, e] of [['2026-07-01', '2026-08-20'], ['2026-12-01', '2027-06-01'], ['2026-09-09', '2026-09-09']]) {
    const c = clip(s!, e!, w)!;
    assert.ok(c.left >= 0, `left 가 음수다: ${s}`);
    assert.ok(c.left + c.width <= 1 + 1e-9, `오른쪽으로 넘친다: ${s}`);
  }
});

// ---- 월 눈금 ----------------------------------------------------------

test('월 눈금이 창 안에 든다', () => {
  const ticks = monthTicks(w);
  assert.ok(ticks.length >= 6, `실제 ${ticks.length}`);
  for (const t of ticks) assert.ok(t.left < 1);
  assert.equal(ticks[0]!.label, '8월');
});

// ---- 오늘 위치 --------------------------------------------------------

test('창이 오늘 시작이면 오늘은 0', () => {
  assert.equal(todayLeft(TODAY, w), 0);
});

test('오늘이 창 밖이면 0 또는 1 로 잘린다', () => {
  assert.equal(todayLeft('2020-01-01', w), 0);
  assert.equal(todayLeft('2030-01-01', w), 1);
});

// ---- 행 만들기 --------------------------------------------------------

const plan = (over: Partial<ExamPlan> = {}): ExamPlan => ({
  examSlug: '정보처리기사', groupId: 'hrdk-regular', sessionId: hrdk.id, phase: 'written', ...over,
});

test('행은 그룹 단위다 — 같은 그룹 2종목이 한 행', () => {
  const rows = buildRows(
    [plan(), plan({ examSlug: '위험물산업기사' })],
    [hrdk], [group('hrdk-regular')], nameOf, w,
  );
  assert.equal(rows.length, 1, '종목마다 행을 만들면 안 된다');
  assert.equal(rows[0]!.label, '정처기 +1');
  assert.deepEqual(rows[0]!.examSlugs, ['정보처리기사', '위험물산업기사']);
});

test('한 종목만 고르면 +N 을 붙이지 않는다', () => {
  const rows = buildRows([plan()], [hrdk], [group('hrdk-regular')], nameOf, w);
  assert.equal(rows[0]!.label, '정처기');
});

test('창 안 이벤트만 막대가 된다', () => {
  const rows = buildRows([plan()], [hrdk], [group('hrdk-regular')], nameOf, w);
  // 필기 원서접수(07-20~07-23)는 창(08-13 시작) 밖이라 빠진다
  const labels = rows[0]!.bars.map(b => b.label);
  assert.ok(!labels.includes('필기 원서접수'), '창 밖 이벤트가 들어왔다');
  assert.ok(labels.includes('필기시험'));
  assert.ok(labels.includes('최종 합격발표'));
});

test('하루짜리는 점이다', () => {
  const rows = buildRows([plan()], [hrdk], [group('hrdk-regular')], nameOf, w);
  const result = rows[0]!.bars.find(b => b.label === '필기 합격발표')!;
  assert.equal(result.isPoint, true);
  const exam = rows[0]!.bars.find(b => b.label === '필기시험')!;
  assert.equal(exam.isPoint, false, '26일 기간은 점이 아니다');
});

test('응시일을 지정하면 마커가 생기고 원래 막대는 흐려진다', () => {
  const rows = buildRows([plan({ date: '2026-08-20' })], [hrdk], [group('hrdk-regular')], nameOf, w);
  assert.equal(rows[0]!.markers.length, 1);
  assert.match(rows[0]!.markers[0]!.label, /정처기 필기시험/);
  assert.equal(rows[0]!.bars.find(b => b.label === '필기시험')!.superseded, true);
});

test('지정하지 않으면 마커가 없다', () => {
  const rows = buildRows([plan()], [hrdk], [group('hrdk-regular')], nameOf, w);
  assert.equal(rows[0]!.markers.length, 0);
});

test('상시시험 그룹은 행을 만들지 않는다', () => {
  const rows = buildRows(
    [plan({ groupId: 'korcham-rolling', examSlug: '컴퓨터활용능력1급', sessionId: '' })],
    [hrdk], [group('korcham-rolling', 'rolling')], nameOf, w,
  );
  assert.deepEqual(rows, []);
});

test('이벤트가 많으면 밴드로 바꾼다', () => {
  // 회차마다 이벤트 2개씩, 임계를 넘도록 만든다
  const many: Session[] = Array.from({ length: DENSE_THRESHOLD + 2 }, (_, i) => ({
    id: `daily-${i}`, groupId: 'daily', year: 2026, seq: i + 1, label: null,
    mode: 'scheduled' as const, status: 'confirmed' as const,
    events: [ev('exam', 'single', `2026-09-${String((i % 28) + 1).padStart(2, '0')}`, `2026-09-${String((i % 28) + 1).padStart(2, '0')}`, 1, '시험')],
  }));
  const rows = buildRows(
    [{ examSlug: '지게차운전기능사', groupId: 'daily', sessionId: 'daily-0', phase: 'single' }],
    many, [group('daily', 'frequent')], nameOf, w,
  );
  assert.equal(rows[0]!.dense, true);
  assert.deepEqual(rows[0]!.bars, [], '밴드로 그리므로 개별 막대는 만들지 않는다');
  assert.ok(rows[0]!.eventCount > DENSE_THRESHOLD);
});

test('미공고 회차는 그리지 않는다', () => {
  const tbd: Session = { ...hrdk, id: 'tbd', status: 'tbd', events: [] };
  const rows = buildRows([plan({ sessionId: 'tbd' })], [tbd], [group('hrdk-regular')], nameOf, w);
  assert.equal(rows[0]!.bars.length, 0);
});

test('계획이 없으면 행이 없다', () => {
  assert.deepEqual(buildRows([], [hrdk], [group('hrdk-regular')], nameOf, w), []);
});
