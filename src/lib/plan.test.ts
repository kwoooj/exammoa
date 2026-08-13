// node --test src/lib/plan.test.ts
//
// 픽스처는 실제 수집 데이터(정보처리기사 2026년 3회)를 그대로 옮긴 것이다.
// 필기 26일·실기 21일 기간 시행이라는 점이 이 로직의 전제다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ExamPlan, Session } from '../types.ts';
import {
  ddayItems, examOptions, occupantsOn, planKey, regDeadlineOf, resolvePlan, sameDayMessage,
} from './plan.ts';

const ev = (kind: 'reg' | 'exam' | 'result', phase: 'written' | 'practical' | 'single',
  start: string, end: string, seq = 1, label = '') => ({ kind, phase, start, end, seq, label, note: null });

/** 정보처리기사 2026년 3회 실측값 */
const hrdk: Session = {
  id: 'hrdk-regular-2026-3',
  groupId: 'hrdk-regular',
  year: 2026,
  seq: 3,
  label: '국가기술자격 기사 (2026년도 제3회)',
  mode: 'scheduled',
  status: 'confirmed',
  events: [
    ev('reg', 'written', '2026-07-20', '2026-07-23', 1, '필기 원서접수'),
    ev('reg', 'written', '2026-08-01', '2026-08-02', 2, '필기 빈자리접수'),
    ev('exam', 'written', '2026-08-07', '2026-09-01', 1, '필기시험'),
    ev('result', 'written', '2026-09-09', '2026-09-09', 1, '필기 합격발표'),
    ev('reg', 'practical', '2026-09-21', '2026-10-19', 1, '실기 원서접수'),
    ev('exam', 'practical', '2026-10-24', '2026-11-13', 1, '실기시험'),
    ev('result', 'practical', '2026-12-11', '2026-12-11', 1, '최종 합격발표'),
  ],
};

/** 하루짜리 시험 */
const oneDay: Session = {
  id: 'history-exam-2026-77',
  groupId: 'history-exam',
  year: 2026,
  seq: 77,
  label: '제77회',
  mode: 'scheduled',
  status: 'confirmed',
  events: [
    ev('reg', 'single', '2026-01-06', '2026-01-13', 1, '원서접수'),
    ev('exam', 'single', '2026-02-07', '2026-02-07', 1, '시험'),
  ],
};

const rolling: Session = {
  id: 'korcham-rolling-2026-x',
  groupId: 'korcham-rolling',
  year: 2026,
  seq: null,
  label: null,
  mode: 'rolling',
  status: 'confirmed',
  events: [],
};

const tbd: Session = { ...oneDay, id: 'tbd-1', status: 'tbd', events: [] };

const sessions = [hrdk, oneDay, rolling, tbd];
const nameOf = (slug: string) => ({ 정보처리기사: '정처기', 한국사능력검정시험: '한능검' }[slug] ?? slug);

// ---- 접수 마감 ---------------------------------------------------------

test('정기접수 마감을 쓴다. 빈자리접수는 마감이 아니다', () => {
  // 빈자리(08-01~08-02)가 정기(07-20~07-23)보다 늦지만 마감은 정기 쪽이다
  assert.equal(regDeadlineOf(hrdk, 'written'), '2026-07-23');
});

test('접수가 하나면 그것이 마감', () => {
  assert.equal(regDeadlineOf(hrdk, 'practical'), '2026-10-19');
});

test('접수 이벤트가 없으면 null', () => {
  assert.equal(regDeadlineOf(oneDay, 'written'), null);
});

// ---- 지정 후보 ---------------------------------------------------------

test('시험 이벤트만 후보가 된다', () => {
  const opts = examOptions(hrdk);
  assert.equal(opts.length, 2);
  assert.deepEqual(opts.map(o => o.phase), ['written', 'practical']);
});

test('기간 시행은 isRange 다 — 필기 26일', () => {
  const written = examOptions(hrdk)[0]!;
  assert.equal(written.isRange, true);
  assert.equal(written.start, '2026-08-07');
  assert.equal(written.end, '2026-09-01');
});

test('하루짜리는 isRange 가 아니다', () => {
  assert.equal(examOptions(oneDay)[0]!.isRange, false);
});

test('상시시험은 지정 대상이 아니다', () => {
  assert.deepEqual(examOptions(rolling), []);
});

test('미공고 회차도 지정 대상이 아니다', () => {
  assert.deepEqual(examOptions(tbd), []);
});

// ---- 계획 해석 ---------------------------------------------------------

const plan = (over: Partial<ExamPlan> = {}): ExamPlan => ({
  examSlug: '정보처리기사', groupId: 'hrdk-regular', sessionId: hrdk.id, phase: 'written', ...over,
});

test('기간 시행은 지정 전까지 needsPick', () => {
  const r = resolvePlan(plan(), sessions);
  assert.equal(r.needsPick, true);
  assert.equal(r.examDate, null);
  assert.equal(r.regDeadline, '2026-07-23');
});

test('지정하면 그 날짜가 응시일이 된다', () => {
  const r = resolvePlan(plan({ date: '2026-08-20' }), sessions);
  assert.equal(r.needsPick, false);
  assert.equal(r.examDate, '2026-08-20');
});

test('기간을 벗어난 지정은 응시일로 인정하지 않는다', () => {
  const r = resolvePlan(plan({ date: '2026-09-15' }), sessions);
  assert.equal(r.outOfRange, true);
  assert.equal(r.examDate, null, '벗어난 날짜로 D-Day 를 만들면 거짓이 된다');
});

test('하루짜리는 지정 없이도 응시일이 정해진다', () => {
  const r = resolvePlan(
    { examSlug: '한국사능력검정시험', groupId: 'history-exam', sessionId: oneDay.id, phase: 'single' },
    sessions,
  );
  assert.equal(r.examDate, '2026-02-07');
  assert.equal(r.needsPick, false);
});

test('없는 회차를 가리키면 조용히 빈 결과', () => {
  const r = resolvePlan(plan({ sessionId: '없음' }), sessions);
  assert.equal(r.option, null);
  assert.equal(r.examDate, null);
});

// ---- D-Day -------------------------------------------------------------

test('시험일과 접수 마감을 가까운 순으로 낸다', () => {
  const items = ddayItems([plan({ date: '2026-08-20' })], sessions, nameOf, '2026-07-01');
  assert.deepEqual(items.map(i => [i.kind, i.date]), [
    ['reg-deadline', '2026-07-23'],
    ['exam', '2026-08-20'],
  ]);
  assert.equal(items[0]!.dday, 22);
  assert.equal(items[0]!.label, '필기 원서접수 마감');
  assert.equal(items[0]!.examName, '정처기');
});

test('지난 항목은 담지 않는다', () => {
  // 접수 마감(07-23)이 지난 시점
  const items = ddayItems([plan({ date: '2026-08-20' })], sessions, nameOf, '2026-08-01');
  assert.deepEqual(items.map(i => i.kind), ['exam']);
});

test('오늘은 담는다 (D-0)', () => {
  const items = ddayItems([plan({ date: '2026-08-20' })], sessions, nameOf, '2026-08-20');
  assert.equal(items.length, 1);
  assert.equal(items[0]!.dday, 0);
});

test('응시일을 안 골랐으면 시험 항목이 없고 접수 마감만 남는다', () => {
  const items = ddayItems([plan()], sessions, nameOf, '2026-07-01');
  assert.deepEqual(items.map(i => i.kind), ['reg-deadline']);
});

test('여러 계획을 날짜순으로 섞는다', () => {
  const items = ddayItems(
    [
      plan({ date: '2026-08-20' }),
      { examSlug: '한국사능력검정시험', groupId: 'history-exam', sessionId: oneDay.id, phase: 'single' },
    ],
    sessions, nameOf, '2026-01-01',
  );
  assert.deepEqual(items.map(i => i.date), ['2026-01-13', '2026-02-07', '2026-07-23', '2026-08-20']);
});

test('같은 날이면 접수 마감을 시험보다 먼저 놓는다', () => {
  const s: Session = {
    ...oneDay, id: 'same-day',
    events: [ev('reg', 'single', '2026-03-01', '2026-05-05', 1, '원서접수'), ev('exam', 'single', '2026-05-05', '2026-05-05', 1, '시험')],
  };
  const items = ddayItems(
    [{ examSlug: 'x', groupId: 'g', sessionId: 'same-day', phase: 'single' }],
    [s], nameOf, '2026-01-01',
  );
  assert.deepEqual(items.map(i => i.kind), ['reg-deadline', 'exam']);
});

// ---- 같은 날 안내 ------------------------------------------------------

test('지정한 시험일이 같으면 알려준다', () => {
  const a = plan({ date: '2026-08-20' });
  const b = plan({ examSlug: '다른종목', phase: 'practical', date: '2026-08-20' });
  const occ = occupantsOn('2026-08-20', [a, b], sessions, nameOf, planKey(b));
  assert.equal(occ.length, 1);
  assert.equal(occ[0]!.examName, '정처기');
  assert.equal(sameDayMessage('2026-08-20', occ), '이미 2026.08.20에는 정처기 필기시험이 있습니다');
});

test('자기 자신은 세지 않는다', () => {
  const a = plan({ date: '2026-08-20' });
  assert.deepEqual(occupantsOn('2026-08-20', [a], sessions, nameOf, planKey(a)), []);
});

test('접수 마감이 같은 날인 것은 안내하지 않는다 — 지정한 시험일끼리만 본다', () => {
  const a = plan({ date: '2026-07-23' }); // 실은 기간 밖이라 응시일로 인정 안 됨
  assert.deepEqual(occupantsOn('2026-07-23', [a], sessions, nameOf), []);
});

test('둘 이상이면 외 N건으로 줄인다', () => {
  const occ = [
    { planKey: 'a', examName: '정처기', label: '필기시험' },
    { planKey: 'b', examName: '한능검', label: '시험' },
  ];
  assert.equal(sameDayMessage('2026-08-20', occ), '이미 2026.08.20에는 정처기 필기시험 외 1건이 있습니다');
});

test('비어 있으면 안내 문구가 없다', () => {
  assert.equal(sameDayMessage('2026-08-20', []), null);
});

// ---- 키 ---------------------------------------------------------------

test('같은 종목의 필기와 실기는 다른 계획이다', () => {
  assert.notEqual(planKey(plan()), planKey(plan({ phase: 'practical' })));
});
