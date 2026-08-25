// node --test src/lib/status.test.ts
//
// 픽스처는 data/published/sessions.json 의 실측값을 손으로 옮긴 것이다.
// 파일에서 읽지 않는다 — 배치가 매일 다시 쓰므로 코드가 아니라 데이터에 따라 깨진다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Exam, ScheduleGroup, Session } from '../types.ts';
import {
  CADENCE_LABEL,
  REG_CLOSING_DAYS,
  compareByUrgency,
  matchesStatusFilter,
  statusOfExam,
  statusOfGroup,
} from './status.ts';

// ---- 실측 픽스처 -------------------------------------------------------

/** hrdk-regular-2026-3. 필기 기간 시험(26일)과 빈자리접수(seq 2)가 함께 있다 */
const 기사3회: Session = {
  id: 'hrdk-regular-2026-3',
  groupId: 'hrdk-regular',
  year: 2026,
  seq: 3,
  label: '국가기술자격 기사 (2026년도 제3회)',
  mode: 'scheduled',
  status: 'confirmed',
  events: [
    { kind: 'reg', phase: 'written', start: '2026-07-20', end: '2026-07-23', seq: 1, label: '필기 원서접수', note: null },
    { kind: 'reg', phase: 'written', start: '2026-08-01', end: '2026-08-02', seq: 2, label: '필기 빈자리접수', note: '빈자리접수' },
    { kind: 'exam', phase: 'written', start: '2026-08-07', end: '2026-09-01', seq: 1, label: '필기시험', note: null },
    { kind: 'result', phase: 'written', start: '2026-09-09', end: '2026-09-09', seq: 1, label: '필기 합격발표', note: null },
    { kind: 'reg', phase: 'practical', start: '2026-09-21', end: '2026-10-19', seq: 1, label: '실기 원서접수', note: null },
    { kind: 'exam', phase: 'practical', start: '2026-10-24', end: '2026-11-13', seq: 1, label: '실기시험', note: null },
    { kind: 'result', phase: 'practical', start: '2026-12-11', end: '2026-12-11', seq: 1, label: '최종 합격발표', note: null },
  ],
};

const hrdkRegular: ScheduleGroup = {
  id: 'hrdk-regular', name: '국가기술자격 정기검정', agency: '한국산업인력공단',
  cadence: 'periodic', examSlugs: ['정보처리기사'],
};

/** history-exam-2026-77. 하루짜리 시험 + 취소좌석 접수(seq 2) */
const 한능검77회: Session = {
  id: 'history-exam-2026-77', groupId: 'history-exam', year: 2026, seq: 77, label: '제77회',
  mode: 'scheduled', status: 'confirmed',
  events: [
    { kind: 'reg', phase: 'single', start: '2026-01-06', end: '2026-01-13', seq: 1, label: '원서접수', note: null },
    { kind: 'reg', phase: 'single', start: '2026-01-20', end: '2026-01-23', seq: 2, label: '취소좌석 접수', note: '취소좌석접수' },
    { kind: 'exam', phase: 'single', start: '2026-02-07', end: '2026-02-07', seq: 1, label: '시험', note: null },
    { kind: 'result', phase: 'single', start: '2026-02-20', end: '2026-02-20', seq: 1, label: '합격자발표', note: null },
  ],
};

const historyGroup: ScheduleGroup = {
  id: 'history-exam', name: '한국사능력검정시험', agency: '국사편찬위원회',
  cadence: 'periodic', examSlugs: ['한국사능력검정시험'],
};

/** korcham-rolling-2026-rolling. 상시시험은 events 가 비어 있다 */
const 상시회차: Session = {
  id: 'korcham-rolling-2026-rolling', groupId: 'korcham-rolling', year: 2026,
  seq: null, label: null, mode: 'rolling', status: 'confirmed', events: [],
};

const korchamRolling: ScheduleGroup = {
  id: 'korcham-rolling', name: '컴퓨터활용능력 · 워드프로세서', agency: '대한상공회의소',
  cadence: 'rolling', rollingRule: '상시시험. 접수는 시험일 4일 전까지',
  examSlugs: ['컴퓨터활용능력1급'],
};

const 컴활1급: Exam = {
  slug: '컴퓨터활용능력1급', name: '컴퓨터활용능력 1급', short: '컴활1급', groupId: 'korcham-rolling',
  jmCd: null, qualgbCd: null, series: null, category: 'office', tier: 'T4', priority: 1,
  rolling: true,
};

const 기사 = (today: string) => statusOfGroup(hrdkRegular, [기사3회], today);

// ---- 우선순위 1~6 을 날짜로 훑는다 -------------------------------------

test('접수 전에는 접수 예정이다', () => {
  const s = 기사('2026-07-01');
  assert.equal(s.id, 'reg-upcoming');
  assert.equal(s.rank, 4);
  assert.equal(s.label, '7월 20일 접수 시작');
  assert.equal(s.emphasis, false);
});

test('접수 시작일 당일부터 접수 중이다', () => {
  // 경계값. start <= today 이지 start < today 가 아니다.
  // 실기 접수(09-21~10-19)를 쓴다 — 필기 접수는 4일짜리라 시작일부터 이미 임박이다.
  const s = 기사('2026-09-21');
  assert.equal(s.id, 'reg-open');
  assert.equal(s.rank, 2);
  assert.equal(s.label, '접수 중 · 10월 19일까지');
  assert.equal(s.emphasis, true);
});

test('마감 3일 전에 임박으로 올라간다', () => {
  assert.equal(REG_CLOSING_DAYS, 3);
  assert.equal(기사('2026-10-15').id, 'reg-open');   // D-4
  assert.equal(기사('2026-10-16').id, 'reg-closing'); // D-3
});

test('접수 D-2 문구가 정확하다', () => {
  const s = 기사('2026-10-17');
  assert.equal(s.id, 'reg-closing');
  assert.equal(s.rank, 1);
  assert.equal(s.label, '접수 D-2');
  assert.equal(s.emphasis, true);
});

test('마감 당일은 D-0 이 아니라 오늘 마감이라고 쓴다', () => {
  // "D-DAY" 만으로는 시작인지 마감인지 알 수 없다.
  const s = 기사('2026-10-19');
  assert.equal(s.id, 'reg-closing');
  assert.equal(s.label, '접수 오늘 마감');
});

test('마감 다음 날에는 접수 중이 아니다', () => {
  const s = 기사('2026-10-20');
  assert.notEqual(s.id, 'reg-open');
  assert.notEqual(s.id, 'reg-closing');
});

test('접수 기간이 짧으면 시작일부터 임박이다', () => {
  // 필기 접수는 4일(07-20~07-23)이다. 실측에 흔한 모양이라 예외가 아니다.
  const s = 기사('2026-07-20');
  assert.equal(s.id, 'reg-closing');
  assert.equal(s.label, '접수 D-3');
});

test('빈자리접수도 접수 중으로 잡되 문구는 원본을 쓴다', () => {
  // seq 2 는 정기접수가 아니다. "필기 원서접수" 라고 읽어 주면 다른 접수를 놓친다.
  const s = 기사('2026-08-01');
  assert.equal(s.id, 'reg-closing');
  assert.ok(s.a11yLabel.includes('필기 빈자리접수'), s.a11yLabel);
});

test('기간 시험 중에는 시험 진행 중이다', () => {
  // 필기가 26일짜리 CBT 다. 시험이 점이 아니라 막대다.
  const s = 기사('2026-08-20');
  assert.equal(s.id, 'exam-ongoing');
  assert.equal(s.rank, 3);
  assert.equal(s.label, '시험 진행 중');
  assert.equal(s.emphasis, false);
});

test('시험 마지막 날까지 진행 중이다', () => {
  assert.equal(기사('2026-09-01').id, 'exam-ongoing');
});

test('필기가 끝나면 실기 접수 예정으로 넘어간다', () => {
  const s = 기사('2026-09-10');
  assert.equal(s.id, 'reg-upcoming');
  assert.equal(s.label, '9월 21일 접수 시작');
  assert.equal(s.date, '2026-09-21');
});

test('실기 접수가 끝나면 시험 예정이다', () => {
  const s = 기사('2026-10-20');
  assert.equal(s.id, 'exam-upcoming');
  assert.equal(s.rank, 5);
  assert.equal(s.label, '10월 24일 시험 시작');
});

test('시험이 끝나면 발표만 남는다', () => {
  const s = 기사('2026-11-20');
  assert.equal(s.id, 'result-upcoming');
  assert.equal(s.rank, 6);
  assert.equal(s.label, '12월 11일 발표');
});

test('발표까지 지나면 종료다', () => {
  const s = 기사('2026-12-12');
  assert.equal(s.id, 'ended');
  assert.equal(s.rank, 9);
  assert.equal(s.label, '올해 일정 종료');
});

// ---- 우선순위가 표를 따른다 --------------------------------------------

test('접수 마감 임박이 시험 진행 중을 이긴다', () => {
  // 접수를 놓치면 시험을 아예 못 본다. 그래서 급한 쪽이 접수다.
  const 겹침: Session = {
    ...기사3회, id: 'overlap',
    events: [
      { kind: 'reg', phase: 'practical', start: '2026-08-18', end: '2026-08-21', seq: 1, label: '실기 원서접수', note: null },
      { kind: 'exam', phase: 'written', start: '2026-08-07', end: '2026-09-01', seq: 1, label: '필기시험', note: null },
    ],
  };
  const s = statusOfGroup(hrdkRegular, [겹침], '2026-08-20');
  assert.equal(s.id, 'reg-closing');
});

test('접수가 여럿 열려 있으면 먼저 닫히는 것을 고른다', () => {
  const 둘: Session = {
    ...기사3회, id: 'two',
    events: [
      { kind: 'reg', phase: 'written', start: '2026-08-01', end: '2026-08-30', seq: 1, label: '느린 접수', note: null },
      { kind: 'reg', phase: 'practical', start: '2026-08-01', end: '2026-08-12', seq: 1, label: '급한 접수', note: null },
    ],
  };
  const s = statusOfGroup(hrdkRegular, [둘], '2026-08-10');
  assert.equal(s.id, 'reg-closing');
  assert.equal(s.date, '2026-08-12');
});

// ---- 하루짜리 시험 -----------------------------------------------------

test('하루짜리 시험도 당일에는 진행 중이다', () => {
  const s = statusOfGroup(historyGroup, [한능검77회], '2026-02-07');
  assert.equal(s.id, 'exam-ongoing');
});

test('취소좌석 접수를 별개 접수로 본다', () => {
  const s = statusOfGroup(historyGroup, [한능검77회], '2026-01-21');
  assert.equal(s.id, 'reg-closing');
  assert.ok(s.a11yLabel.includes('취소좌석 접수'), s.a11yLabel);
});

// ---- 7번 상시시험 (CLAUDE.md 규칙 5) -----------------------------------

test('상시시험은 미공고가 아니라 상시시험이다', () => {
  // 회귀 테스트. 둘 다 events 가 비어 있어 뭉뚱그리기 쉽지만 뜻이 정반대다 —
  // 상시는 아무 때나 볼 수 있는 것이고 미공고는 아직 못 보는 것이다.
  const s = statusOfGroup(korchamRolling, [상시회차], '2026-08-14');
  assert.equal(s.id, 'rolling');
  assert.equal(s.rank, 7);
  assert.equal(s.label, '상시시험');
});

test('그룹 선언이 없어도 회차가 전부 상시면 상시다', () => {
  const noCadence: ScheduleGroup = { ...korchamRolling, cadence: 'periodic' };
  assert.equal(statusOfGroup(noCadence, [상시회차], '2026-08-14').id, 'rolling');
});

test('종목이 상시라고 선언하면 그룹보다 우선한다', () => {
  const s = statusOfExam(컴활1급, hrdkRegular, [기사3회], '2026-08-14');
  assert.equal(s.id, 'rolling');
});

test('상시시험은 날짜가 지나도 종료되지 않는다', () => {
  assert.equal(statusOfGroup(korchamRolling, [상시회차], '2030-01-01').id, 'rolling');
});

// ---- 8번 일정 미공고 ---------------------------------------------------

test('회차가 없으면 미공고다', () => {
  // 실데이터의 kca-security · korcham-acct 가 이 모양이다 (sessionCount 0).
  const s = statusOfGroup(hrdkRegular, [], '2026-08-14');
  assert.equal(s.id, 'tbd');
  assert.equal(s.rank, 8);
  assert.equal(s.label, '일정 미공고');
});

test('그룹을 못 찾아도 미공고로 떨어진다', () => {
  assert.equal(statusOfGroup(undefined, [], '2026-08-14').id, 'tbd');
});

test('status:tbd 인 회차는 일정으로 세지 않는다', () => {
  // 게시 데이터에 0건이라 실데이터로는 검증되지 않는 분기다. 여기서만 지켜진다.
  const 미정: Session = { ...기사3회, id: 'tbd-1', status: 'tbd' };
  assert.equal(statusOfGroup(hrdkRegular, [미정], '2026-08-14').id, 'tbd');
});

test('공식 일정 수집 대기는 미공고와 다른 문구로 안내한다', () => {
  const 연동대기: Session = {
    ...기사3회, id: 'pending-1', status: 'tbd', events: [], scheduleState: 'import-pending',
  };
  const status = statusOfGroup(hrdkRegular, [연동대기], '2026-08-14');
  assert.equal(status.id, 'tbd');
  assert.equal(status.label, '일정 연동 준비 중');
  assert.equal(status.pendingImport, true);
});

test('이벤트가 하나도 없는 확정 회차도 미공고다', () => {
  const 빈회차: Session = { ...기사3회, id: 'empty', events: [] };
  assert.equal(statusOfGroup(hrdkRegular, [빈회차], '2026-08-14').id, 'tbd');
});

// ---- 연도 가드 ---------------------------------------------------------

test('해가 바뀌면 종료가 아니라 미공고다', () => {
  // 날짜가 정해진 버그다. 2027-01-01 이 되면 모든 정기 그룹의 이벤트가 전부
  // 과거가 되어 "올해 일정 종료" 가 걸린다. 참인 답은 "2027년 일정 미공고" 다.
  const s = 기사('2027-01-15');
  assert.equal(s.id, 'tbd');
  assert.notEqual(s.label, '올해 일정 종료');
});

test('같은 해 안에서 일정이 끝난 것은 종료가 맞다', () => {
  assert.equal(기사('2026-12-31').id, 'ended');
});

test('다음 해 일정이 붙어 있으면 미공고가 아니다', () => {
  const 다음해: Session = {
    ...기사3회, id: 'hrdk-regular-2027-1', year: 2027,
    events: [{ kind: 'reg', phase: 'written', start: '2027-02-01', end: '2027-02-05', seq: 1, label: '필기 원서접수', note: null }],
  };
  const s = statusOfGroup(hrdkRegular, [기사3회, 다음해], '2027-01-15');
  assert.equal(s.id, 'reg-upcoming');
});

// ---- 정렬 (§6.5) -------------------------------------------------------

test('급한 상태가 앞에 온다', () => {
  const list = [기사('2026-11-20'), 기사('2026-07-21'), 기사('2026-09-10'), 기사('2026-08-20')];
  const ids = [...list].sort(compareByUrgency).map(s => s.id);
  assert.deepEqual(ids, ['reg-closing', 'exam-ongoing', 'reg-upcoming', 'result-upcoming']);
});

test('같은 상태끼리는 날짜가 가까운 것이 앞이다', () => {
  const a = statusOfGroup(hrdkRegular, [기사3회], '2026-09-10');
  const b = statusOfGroup(historyGroup, [{ ...한능검77회, year: 2026,
    events: [{ kind: 'reg', phase: 'single', start: '2026-09-15', end: '2026-09-18', seq: 1, label: '원서접수', note: null }] }], '2026-09-10');
  assert.deepEqual([a, b].sort(compareByUrgency).map(s => s.date), ['2026-09-15', '2026-09-21']);
});

test('날짜 없는 상태는 뒤로 간다', () => {
  const rolling = statusOfGroup(korchamRolling, [상시회차], '2026-08-14');
  const open = 기사('2026-07-21');
  assert.deepEqual([rolling, open].sort(compareByUrgency).map(s => s.id), ['reg-closing', 'rolling']);
});

// ---- 필터 (§6.4) -------------------------------------------------------

test('접수 중 필터는 임박도 함께 잡는다', () => {
  // 마감이 임박했다고 접수 중 목록에서 사라지면 가장 급한 것이 안 보인다.
  assert.ok(matchesStatusFilter(기사('2026-09-21'), 'open')); // reg-open
  assert.ok(matchesStatusFilter(기사('2026-10-17'), 'open')); // reg-closing
  assert.ok(!matchesStatusFilter(기사('2026-07-01'), 'open'));
});

test('나머지 필터가 각자 하나씩만 잡는다', () => {
  assert.ok(matchesStatusFilter(기사('2026-07-01'), 'upcoming'));
  assert.ok(matchesStatusFilter(기사('2026-10-20'), 'exam-upcoming'));
  assert.ok(matchesStatusFilter(statusOfGroup(korchamRolling, [상시회차], '2026-08-14'), 'rolling'));
  assert.ok(matchesStatusFilter(statusOfGroup(hrdkRegular, [], '2026-08-14'), 'tbd'));
});

// ---- 표현 (§3.2) -------------------------------------------------------

test('강조색은 접수 중과 접수 임박에만 준다', () => {
  const emphasized = ['2026-09-21', '2026-10-17'].map(d => 기사(d));
  const neutral = ['2026-07-01', '2026-08-20', '2026-10-20', '2026-11-20', '2026-12-12'].map(d => 기사(d));
  for (const s of emphasized) assert.equal(s.emphasis, true, s.id);
  for (const s of neutral) assert.equal(s.emphasis, false, s.id);
});

test('접근성 이름이 대상 이벤트를 담는다', () => {
  // "D-2" 만 읽으면 무엇이 이틀 남았는지 알 수 없다 (§14).
  const s = 기사('2026-07-21');
  assert.equal(s.a11yLabel, '필기 원서접수 마감 2일 전');
  assert.ok(!s.a11yLabel.includes('D-'));
});

test('상태마다 이름이 비지 않는다', () => {
  const all = ['2026-07-01', '2026-07-20', '2026-07-21', '2026-08-20', '2026-10-20', '2026-11-20', '2026-12-12']
    .map(d => 기사(d));
  all.push(statusOfGroup(korchamRolling, [상시회차], '2026-08-14'));
  all.push(statusOfGroup(hrdkRegular, [], '2026-08-14'));
  for (const s of all) {
    assert.ok(s.label.length > 0, s.id);
    assert.ok(s.a11yLabel.length > 0, s.id);
  }
});

test('유형 라벨이 세 주기를 모두 덮는다', () => {
  assert.deepEqual(Object.keys(CADENCE_LABEL).sort(), ['frequent', 'periodic', 'rolling']);
});
