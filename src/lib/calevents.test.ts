// node --test src/lib/calevents.test.ts
//
// 픽스처는 data/published/*.json 의 실측값을 손으로 옮긴 것이다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Exam, ScheduleGroup, Session } from '../types.ts';
import { barAriaLabel, buildCalendarData, scheduleTable, stateOf } from './calevents.ts';
import { layoutMonth } from './monthbars.ts';

// ---- 실측 픽스처 -------------------------------------------------------

const exam = (slug: string, name: string, groupId: string, o: Partial<Exam> = {}): Exam => ({
  slug, name, short: null, groupId, jmCd: null, qualgbCd: null, series: null,
  category: 'it', tier: 'T1', priority: 1, ...o,
});

/** 실측: 이 그룹의 29종목은 이벤트 단위로 일정이 완전히 동일하다 */
const 기사종목 = [
  exam('정보처리기사', '정보처리기사', 'hrdk-regular', { short: '정처기' }),
  exam('산업안전기사', '산업안전기사', 'hrdk-regular'),
  exam('건설안전기사', '건설안전기사', 'hrdk-regular'),
  exam('화학분석기사', '화학분석기사', 'hrdk-regular'),
];

const hrdkRegular: ScheduleGroup = {
  id: 'hrdk-regular', name: '국가기술자격 정기검정 (기사·산업기사·서비스)',
  agency: '한국산업인력공단', cadence: 'periodic',
  examSlugs: 기사종목.map(e => e.slug),
  agencyUrl: 'https://www.q-net.or.kr',
};

const 기사3회: Session = {
  id: 'hrdk-regular-2026-3', groupId: 'hrdk-regular', year: 2026, seq: 3,
  label: '국가기술자격 기사 (2026년도 제3회)', mode: 'scheduled', status: 'confirmed',
  events: [
    { kind: 'reg', phase: 'written', start: '2026-07-20', end: '2026-07-23', seq: 1, label: '필기 원서접수', note: null },
    { kind: 'reg', phase: 'written', start: '2026-08-01', end: '2026-08-02', seq: 2, label: '필기 빈자리접수', note: '빈자리접수' },
    { kind: 'exam', phase: 'written', start: '2026-08-07', end: '2026-09-01', seq: 1, label: '필기시험', note: null },
    { kind: 'reg', phase: 'practical', start: '2026-09-21', end: '2026-10-19', seq: 1, label: '실기 원서접수', note: null },
    { kind: 'exam', phase: 'practical', start: '2026-10-24', end: '2026-11-13', seq: 1, label: '실기시험', note: null },
    { kind: 'result', phase: 'practical', start: '2026-12-11', end: '2026-12-11', seq: 1, label: '최종 합격발표', note: null },
  ],
};

/** 상시시험. events 가 비어 있다 */
const 컴활종목 = [
  exam('컴퓨터활용능력1급', '컴퓨터활용능력 1급', 'korcham-rolling', { short: '컴활1급', rolling: true }),
  exam('워드프로세서', '워드프로세서', 'korcham-rolling', { rolling: true }),
];
const korchamRolling: ScheduleGroup = {
  id: 'korcham-rolling', name: '컴퓨터활용능력 · 워드프로세서', agency: '대한상공회의소',
  cadence: 'rolling', rollingRule: '상시시험. 접수는 시험일 4일 전까지',
  ruleCheckedAt: '2026-08-13', examSlugs: 컴활종목.map(e => e.slug),
  agencyUrl: 'https://license.korcham.net',
  applyUrl: 'https://license.korcham.net/ex/dailyExam_join.do',
};
const 상시회차: Session = {
  id: 'korcham-rolling-2026-rolling', groupId: 'korcham-rolling', year: 2026,
  seq: null, label: null, mode: 'rolling', status: 'confirmed', events: [],
};

/** 회차가 아예 없는 그룹. 실데이터의 kca-security · korcham-acct 가 이 모양이다 */
const 보안종목 = [exam('정보보안기사', '정보보안기사', 'kca-security')];
const kcaSecurity: ScheduleGroup = {
  id: 'kca-security', name: '정보보안기사', agency: '한국방송통신전파진흥원',
  cadence: 'periodic', examSlugs: ['정보보안기사'],
  agencyUrl: 'https://www.cq.or.kr/qh_quagm03_001.do',
};

/** 고빈도. 실측 44회차 */
const 토스종목 = [exam('토익스피킹', 'TOEIC Speaking', 'toeic-speaking', { short: '토스', agency: 'YBM' })];
const toeicSpeaking: ScheduleGroup = {
  id: 'toeic-speaking', name: 'TOEIC Speaking', agency: 'YBM', cadence: 'frequent',
  examSlugs: ['토익스피킹'], agencyUrl: 'https://www.toeicswt.co.kr/receipt/examSchList.php',
};
const 토스회차: Session = {
  id: 'toeic-speaking-2026-40', groupId: 'toeic-speaking', year: 2026, seq: 40, label: '제40회',
  mode: 'scheduled', status: 'confirmed',
  events: [
    { kind: 'reg', phase: 'single', start: '2026-10-05', end: '2026-11-05', seq: 1, label: '정기접수', note: null },
    { kind: 'exam', phase: 'single', start: '2026-11-14', end: '2026-11-14', seq: 1, label: '시험', note: null },
    { kind: 'result', phase: 'single', start: '2026-11-24', end: '2026-11-24', seq: 1, label: '성적발표', note: null },
  ],
};

const ALL_EXAMS = [...기사종목, ...컴활종목, ...보안종목, ...토스종목];
const ALL_GROUPS = [hrdkRegular, korchamRolling, kcaSecurity, toeicSpeaking];
const ALL_SESSIONS = [기사3회, 상시회차, 토스회차];

const build = (o: Partial<Parameters<typeof buildCalendarData>[0]> = {}) =>
  buildCalendarData({ sessions: ALL_SESSIONS, groups: ALL_GROUPS, exams: ALL_EXAMS, ...o });

// ---- 시행그룹 중복 제거 (§8.8) -----------------------------------------

test('같은 그룹의 종목을 여러 개 골라도 막대는 한 벌이다', () => {
  // 종목별로 그리면 실측상 같은 막대가 29줄 반복된다.
  const one = build({ selectedSlugs: ['정보처리기사'] });
  const four = build({ selectedSlugs: 기사종목.map(e => e.slug) });
  assert.equal(four.events.length, one.events.length);
  assert.equal(four.events.length, 기사3회.events.length);
});

test('접힌 종목이 막대의 속성으로 남는다', () => {
  const { events } = build({ selectedSlugs: 기사종목.map(e => e.slug) });
  for (const e of events) assert.equal(e.examSlugs.length, 4);
  assert.equal(events[0]!.displayName, '정보처리기사 외 3개');
});

test('선택한 것만 담는다 — 상세 패널 수와 고른 수가 어긋나지 않는다', () => {
  const { events } = build({ selectedSlugs: ['정보처리기사', '산업안전기사'] });
  assert.deepEqual(events[0]!.examSlugs, ['정보처리기사', '산업안전기사']);
  assert.equal(events[0]!.displayName, '정보처리기사 외 1개');
});

test('막대 id 에 slug 가 들어가지 않는다', () => {
  // 중복이 구조적으로 불가능한 이유다.
  const { events } = build({ selectedSlugs: 기사종목.map(e => e.slug) });
  for (const e of events) assert.ok(!e.id.includes('정보처리기사'), e.id);
});

test('그룹이 다르면 날짜가 같아도 접지 않는다', () => {
  const 쌍둥이: ScheduleGroup = { ...hrdkRegular, id: 'twin', examSlugs: ['쌍둥이기사'] };
  const 쌍둥이회차: Session = { ...기사3회, id: 'twin-2026-3', groupId: 'twin' };
  const data = buildCalendarData({
    sessions: [기사3회, 쌍둥이회차],
    groups: [hrdkRegular, 쌍둥이],
    exams: [...기사종목, exam('쌍둥이기사', '쌍둥이기사', 'twin')],
    selectedSlugs: ['정보처리기사', '쌍둥이기사'],
  });
  assert.equal(data.events.length, 기사3회.events.length * 2);
});

test('선택이 없으면 전체 일정 모드다', () => {
  const { events } = build();
  const groupIds = new Set(events.map(e => e.groupId));
  assert.ok(groupIds.has('hrdk-regular'));
  assert.ok(groupIds.has('toeic-speaking'));
});

// ---- 상시시험 (CLAUDE.md 규칙 5) ---------------------------------------

test('상시시험은 막대를 만들지 않고 규칙 카드를 낸다', () => {
  // 진짜 버그는 튀어나온 막대가 아니라 없는 규칙 카드다 — events 가 비어 있어
  // 순진한 구현은 우연히 막대를 안 그리고, 사용자는 설명 없는 빈 달력을 본다.
  const data = build({ selectedSlugs: ['컴퓨터활용능력1급'] });
  assert.deepEqual(data.events, []);
  assert.equal(data.ruleCards.length, 1);
  assert.equal(data.ruleCards[0]!.rule, '상시시험. 접수는 시험일 4일 전까지');
  assert.equal(data.ruleCards[0]!.ruleCheckedAt, '2026-08-13');
});

test('규칙 카드가 공식 링크를 들고 간다', () => {
  const [card] = build({ selectedSlugs: ['컴퓨터활용능력1급'] }).ruleCards;
  assert.equal(card!.applyUrl, 'https://license.korcham.net/ex/dailyExam_join.do');
  assert.equal(card!.agencyUrl, 'https://license.korcham.net');
});

test('그룹 선언이 없어도 회차가 전부 상시면 규칙 카드다', () => {
  const noCadence: ScheduleGroup = { ...korchamRolling, cadence: 'periodic' };
  const data = buildCalendarData({
    sessions: [상시회차], groups: [noCadence], exams: 컴활종목,
    selectedSlugs: ['컴퓨터활용능력1급'],
  });
  assert.equal(data.ruleCards.length, 1);
  assert.deepEqual(data.events, []);
});

test('상시 그룹은 미공고로 새지 않는다', () => {
  const data = build({ selectedSlugs: ['컴퓨터활용능력1급'] });
  assert.deepEqual(data.tbdNotices, []);
});

// ---- 일정 미공고 (§7.8) ------------------------------------------------

test('회차가 없는 그룹은 미공고 안내로 간다', () => {
  const data = build({ selectedSlugs: ['정보보안기사'] });
  assert.equal(data.tbdNotices.length, 1);
  assert.equal(data.tbdNotices[0]!.groupId, 'kca-security');
  assert.deepEqual(data.events, []);
});

test('미공고 안내는 규칙 카드와 섞이지 않는다', () => {
  // 둘 다 events 가 비어 있지만 뜻이 정반대다 — 아무 때나 볼 수 있는 것과
  // 아직 못 보는 것.
  const data = build({ selectedSlugs: ['컴퓨터활용능력1급', '정보보안기사'] });
  assert.equal(data.ruleCards.length, 1);
  assert.equal(data.tbdNotices.length, 1);
  assert.equal(data.ruleCards[0]!.groupId, 'korcham-rolling');
  assert.equal(data.tbdNotices[0]!.groupId, 'kca-security');
});

test('미공고 안내도 공식 링크를 들고 간다', () => {
  // 링크가 없으면 사용자가 막다른 길에 선다.
  const [notice] = build({ selectedSlugs: ['정보보안기사'] }).tbdNotices;
  assert.equal(notice!.agencyUrl, 'https://www.cq.or.kr/qh_quagm03_001.do');
});

test('status:tbd 인 회차만 있으면 미공고다', () => {
  const 미정: Session = { ...기사3회, id: 'tbd-1', status: 'tbd' };
  const data = buildCalendarData({
    sessions: [미정], groups: [hrdkRegular], exams: 기사종목, selectedSlugs: ['정보처리기사'],
  });
  assert.deepEqual(data.events, []);
  assert.equal(data.tbdNotices.length, 1);
});

test('일정이 있는 그룹은 미공고 안내를 내지 않는다', () => {
  const data = build({ selectedSlugs: ['정보처리기사'] });
  assert.deepEqual(data.tbdNotices, []);
});

test('필터로 결과가 비어도 미공고라고 하지 않는다', () => {
  // 필터 때문에 빈 것과 일정이 없는 것은 다르다.
  const data = build({ selectedSlugs: ['정보처리기사'], window: { from: '2030-01-01', to: '2030-12-31' } });
  assert.deepEqual(data.events, []);
  assert.deepEqual(data.tbdNotices, []);
});

// ---- 고빈도 접기 (§8.9) ------------------------------------------------

test('고빈도 그룹은 기간을 펼치지 않는다', () => {
  // 실측: 2026-10 한 달에 toeic-speaking 36건이 몰려 한 칸을 통째로 채운다.
  const data = build({ selectedSlugs: ['토익스피킹'] });
  for (const e of data.events) assert.equal(e.start, e.end, e.id);
  assert.deepEqual(data.summarizedGroupIds, ['toeic-speaking']);
});

test('고빈도 접수는 마감일로 줄인다', () => {
  const [reg] = build({ selectedSlugs: ['토익스피킹'] }).events.filter(e => e.kind === 'reg');
  assert.equal(reg!.start, '2026-11-05'); // 접수 10-05~11-05 의 마감일
});

test('고빈도의 발표는 접기에서 빠진다', () => {
  const data = build({ selectedSlugs: ['토익스피킹'] });
  assert.equal(data.events.filter(e => e.kind === 'result').length, 0);
});

test('정기 그룹은 접지 않는다', () => {
  const data = build({ selectedSlugs: ['정보처리기사'] });
  assert.deepEqual(data.summarizedGroupIds, []);
  assert.ok(data.events.some(e => e.start !== e.end));
});

// ---- 정기접수와 추가접수 (§7.5) ----------------------------------------

test('빈자리접수를 정기접수와 별개 이벤트로 둔다', () => {
  const regs = build({ selectedSlugs: ['정보처리기사'] }).events
    .filter(e => e.kind === 'reg' && e.phase === 'written');
  assert.equal(regs.length, 2);
  assert.deepEqual(regs.map(r => r.seq).sort(), [1, 2]);
});

test('추가접수의 구분 문구가 정기접수와 다르다', () => {
  // 뭉치면 사용자가 이미 지난 정기접수로 읽고 남은 기회를 놓친다.
  const regs = build({ selectedSlugs: ['정보처리기사'] }).events
    .filter(e => e.kind === 'reg' && e.phase === 'written');
  assert.equal(regs.find(r => r.seq === 1)!.kindLabel, '필기 접수');
  assert.equal(regs.find(r => r.seq === 2)!.kindLabel, '필기 추가접수');
});

test('단계가 없는 시행은 구분에 단계를 붙이지 않는다', () => {
  const [e] = build({ selectedSlugs: ['토익스피킹'] }).events.filter(x => x.kind === 'exam');
  assert.equal(e!.kindLabel, '시험');
});

// ---- 막대 문구 (§8.5) --------------------------------------------------

test('막대에 약칭과 이벤트 종류를 함께 쓴다', () => {
  const [e] = build({ selectedSlugs: ['정보처리기사'] }).events;
  assert.equal(e!.text, '정처기 필기 접수');
});

test('여러 종목이 접히면 막대 이름도 접힌다', () => {
  const [e] = build({ selectedSlugs: 기사종목.map(x => x.slug) }).events;
  assert.equal(e!.shortName, '정처기 외 3');
});

// ---- 필터와 창 --------------------------------------------------------

test('일정 종류로 거를 수 있다', () => {
  const data = build({ selectedSlugs: ['정보처리기사'], kinds: ['reg'] });
  assert.ok(data.events.length > 0);
  for (const e of data.events) assert.equal(e.kind, 'reg');
});

test('창 밖의 일정은 빠진다', () => {
  const data = build({ selectedSlugs: ['정보처리기사'], window: { from: '2026-10-01', to: '2026-10-31' } });
  for (const e of data.events) assert.ok(e.end >= '2026-10-01' && e.start <= '2026-10-31', e.id);
});

test('없는 slug 는 조용히 무시한다', () => {
  const data = build({ selectedSlugs: ['정보처리기사', '없는시험'] });
  assert.equal(data.events.length, 기사3회.events.length);
});

test('결과는 날짜순이다', () => {
  const { events } = build();
  const starts = events.map(e => e.start);
  assert.deepEqual([...starts].sort(), starts);
});

// ---- 상태 (§14 — 색 없이도 구분) ---------------------------------------

test('상태 경계값', () => {
  const e = { start: '2026-10-05', end: '2026-10-10' };
  assert.equal(stateOf(e, '2026-10-04'), 'upcoming');
  assert.equal(stateOf(e, '2026-10-05'), 'ongoing');
  assert.equal(stateOf(e, '2026-10-10'), 'ongoing');
  assert.equal(stateOf(e, '2026-10-11'), 'past');
});

test('하루짜리가 오늘이면 오늘이라고 한다', () => {
  assert.equal(stateOf({ start: '2026-10-05', end: '2026-10-05' }, '2026-10-05'), 'today');
});

test('막대 접근성 이름에 종목·구분·기간·상태가 모두 들어간다', () => {
  const [e] = build({ selectedSlugs: 기사종목.map(x => x.slug) }).events;
  assert.equal(
    barAriaLabel(e!, '2026-07-21'),
    '정보처리기사 외 3개, 필기 접수, 7월 20일부터 7월 23일까지, 진행 중',
  );
});

test('공식 시각이 캘린더 상세·표·접근성 이름까지 전달된다', () => {
  const timed: Session = {
    ...기사3회,
    events: 기사3회.events.map((e, i) => i === 0 ? {
      ...e,
      timing: { start: '10:00', end: '18:00', timezone: 'Asia/Seoul', status: 'confirmed' },
    } : e),
  };
  const data = buildCalendarData({
    sessions: [timed], groups: [hrdkRegular], exams: 기사종목, selectedSlugs: ['정보처리기사'],
  });
  const event = data.events.find(e => e.kind === 'reg' && e.seq === 1)!;
  assert.equal(event.timing?.start, '10:00');
  assert.equal(scheduleTable(data.events, '2026-07-21').find(r => r.eventId === event.id)?.timing?.end, '18:00');
  assert.match(barAriaLabel(event, '2026-07-21'), /10:00부터 18:00까지/);
});

test('고빈도 접수 마감점에는 시작 시각이 아니라 마감 시각만 붙는다', () => {
  const timed: Session = {
    ...토스회차,
    events: 토스회차.events.map(e => e.kind === 'reg' ? {
      ...e,
      timing: { start: '10:00', end: '18:00', timezone: 'Asia/Seoul', status: 'confirmed' },
    } : e),
  };
  const data = buildCalendarData({
    sessions: [timed], groups: [toeicSpeaking], exams: 토스종목, selectedSlugs: ['토익스피킹'],
  });
  const reg = data.events.find(e => e.kind === 'reg')!;
  assert.equal(reg.start, '2026-11-05');
  assert.deepEqual(reg.timing, { start: '18:00', timezone: 'Asia/Seoul', status: 'confirmed' });
});

// ---- 날짜순 표 (§8.10) -------------------------------------------------

test('표가 이벤트 하나도 빠뜨리지 않는다', () => {
  const { events } = build({ selectedSlugs: ['정보처리기사'] });
  assert.equal(scheduleTable(events, '2026-08-14').length, events.length);
});

test('표의 날짜 문구가 §16.2 를 따른다', () => {
  const { events } = build({ selectedSlugs: ['정보처리기사'] });
  const rows = scheduleTable(events, '2026-08-14');
  const reg = rows.find(r => r.eventId.includes('practical|1') && r.kindLabel === '실기 접수')!;
  assert.equal(reg.dateLabel, '09.21 ~ 10.19');
  assert.deepEqual(reg.dateTimes, ['2026-09-21', '2026-10-19']);
  const result = rows.find(r => r.kindLabel === '실기 발표')!;
  assert.equal(result.dateLabel, '12.11');
  assert.deepEqual(result.dateTimes, ['2026-12-11']);
});

test('표의 상태가 글자로 나온다', () => {
  const { events } = build({ selectedSlugs: ['정보처리기사'] });
  const rows = scheduleTable(events, '2026-08-14');
  assert.ok(rows.every(r => r.stateLabel.length > 0));
  assert.equal(rows.find(r => r.kindLabel === '필기 시험')!.stateLabel, '진행 중');
});

test('공식 링크가 없으면 열이 비고 그것이 마감을 뜻하지 않는다', () => {
  const 링크없는그룹: ScheduleGroup = { ...hrdkRegular, agencyUrl: undefined, applyUrl: undefined };
  const data = buildCalendarData({
    sessions: [기사3회], groups: [링크없는그룹], exams: 기사종목, selectedSlugs: ['정보처리기사'],
  });
  const [row] = scheduleTable(data.events, '2026-08-14');
  assert.equal(row!.agencyUrl, undefined);
  assert.ok(row!.stateLabel !== '종료' || row!.state === 'past');
});

// ---- 드리프트 방지 -----------------------------------------------------

test('격자가 접은 일정도 표에는 남는다', () => {
  // 외 N건 이 격자에서 감춘 것의 전체 날짜는 표에서 볼 수 있어야 한다 (§8.9).
  // 표를 회차에서 다시 만들면 이 성질이 조용히 깨진다.
  // 일정이 겹치는 두 그룹을 laneCap 1 로 눌러 반드시 접히게 만든다.
  const 쌍둥이: ScheduleGroup = { ...hrdkRegular, id: 'twin', examSlugs: ['쌍둥이기사'] };
  const { events } = buildCalendarData({
    sessions: [기사3회, { ...기사3회, id: 'twin-2026-3', groupId: 'twin' }],
    groups: [hrdkRegular, 쌍둥이],
    exams: [...기사종목, exam('쌍둥이기사', '쌍둥이기사', 'twin')],
  });
  const layout = layoutMonth('2026-10', events, { today: '2026-08-14', laneCap: 1 });
  const rows = new Set(scheduleTable(events, '2026-08-14').map(r => r.eventId));

  assert.ok(layout.foldedIds.length > 0, '이 픽스처로는 아무것도 접히지 않아 검사가 무의미하다');
  for (const id of layout.foldedIds) assert.ok(rows.has(id), `접힌 ${id} 가 표에 없다`);
  for (const s of layout.weeks.flatMap(w => w.segments)) assert.ok(rows.has(s.eventId), s.eventId);
});
