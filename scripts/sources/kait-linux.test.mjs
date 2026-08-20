// node --test scripts/sources/kait-linux.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRADE, parse, parseGrade2Timings, parseRound } from './kait-linux.mjs';

/**
 * 실측 표를 그대로 옮긴 것. 파일이 아니라 여기 두는 이유는 `build/crawl/` 이
 * gitignore 대상이라 CI 에서는 파일이 없고, 그러면 테스트가 조용히 통과하기 때문이다.
 */
const ROWS = [
  ['리눅스마스터', '1급', '2601회', '1차', '01.26.(월) ~ 02.06.(금)', '03.14.(토)', '04.03.(금)'],
  ['리눅스마스터', '1급', '2601회', '2차', '04.06.(월) ~ 04.17.(금)', '05.09.(토)', '05.29.(금)'],
  ['리눅스마스터', '2급', '2601회', '1차', '01.26.(월) ~ 02.04.(수)', '01.27.(화) ~ 02.05.(목)', '시험종료 즉시'],
  ['리눅스마스터', '2급', '2601회', '2차', '01.27.(화) ~ 02.06.(금)', '03.14.(토)', '04.03.(금)'],
  ['리눅스마스터', '2급', '2602회', '1차', '04.06.(월) ~ 04.17.(금)', '05.02.(토)', '시험종료 즉시'],
  ['리눅스마스터', '2급', '2602회', '2차', '04.28.(화) ~ 05.08.(금)', '06.13.(토)', '07.03.(금)'],
  ['리눅스마스터', '2급', '2603회', '1차', '07.06.(월) ~ 07.17.(금)', '08.01.(토)', '08.05.(수)'],
  ['리눅스마스터', '2급', '2603회', '2차', '07.28.(화) ~ 08.07.(금)', '09.12.(토)', '10.02.(금)'],
];

const HEAD = ['종목', '등급', '회차', '차수', '접수일자', '시험일자', '합격자 발표'];
const td = (cells, tag = 'td') => `<tr>${cells.map(c => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
const TIME_TABLE = `<table><caption>입실 및 시험시간</caption>
  <tr><th colspan="2">급수</th><th>입실완료시간</th><th>시험시간</th></tr>
  <tr><th rowspan="2">1급</th><th>1차</th><td rowspan="4">13:50</td><td>14:00 ~ 15:40 (100분)</td></tr>
  <tr><th>2차</th><td>14:00 ~ 15:40 (100분)</td></tr>
  <tr><th rowspan="2">2급</th><th>1차</th><td>14:00 ~ 15:00 (60분)</td></tr>
  <tr><th>2차</th><td>14:00 ~ 15:40 (100분)</td></tr>
</table>`;
const page = (rows = ROWS) =>
  `<html><body><table><caption>정기검정 일정</caption>${td(HEAD, 'th')}${rows.map(r => td(r)).join('')}</table>${TIME_TABLE}</body></html>`;

const run = (rows, year = 2026) => parse(page(rows), { year });

// ---- 회차에서 연도 --------------------------------------------------

test('회차 앞 두 자리가 연도다 — 페이지에 2026 이 한 번도 안 나온다', () => {
  assert.deepEqual(parseRound('2601회'), { year: 2026, seq: 1 });
  assert.deepEqual(parseRound('2604회'), { year: 2026, seq: 4 });
  assert.deepEqual(parseRound('2712회'), { year: 2027, seq: 12 });
});

test('회차 형식이 아니면 null — 추측하지 않는다', () => {
  for (const bad of ['미정', '', null, '1회', '제3회차']) assert.equal(parseRound(bad), null, String(bad));
});

test('다른 연도 표가 남아 있으면 버린다 — 올해 일정으로 게시하면 접수를 놓친다', () => {
  const r = run(ROWS, 2027);
  assert.equal(r.sessions.length, 0);
  assert.ok(r.diagnostics.otherYear > 0);
  assert.equal(r.diagnostics.failures.length, 0, '연도가 다른 것은 파싱 실패가 아니다');
});

// ---- 등급 -----------------------------------------------------------

test('1급은 걸러낸다 — 2급과 일정이 다르다', () => {
  const r = run();
  assert.equal(r.diagnostics.otherGrade, 2);
  assert.equal(GRADE, '2급');
  for (const s of r.sessions) {
    assert.notEqual(s.events.find(e => e.kind === 'exam' && e.phase === 'practical')?.start, '2026-05-09',
      '1급 2차 시험일이 섞였다');
  }
});

// ---- 1차·2차 합치기 ---------------------------------------------------

test('같은 회차의 1차·2차가 한 회차로 합쳐진다', () => {
  const r = run();
  assert.equal(r.sessions.length, 3, 'ROWS 의 2급은 2601·2602·2603');
  const s1 = r.sessions.find(s => s.seq === 1);
  assert.equal(s1.id, 'kait-linux-2026-1');
  assert.deepEqual([...new Set(s1.events.map(e => e.phase))].sort(), ['practical', 'written']);
});

test('1차·2차 날짜가 사이트와 일치한다 (2601회)', () => {
  const s = run().sessions.find(x => x.seq === 1);
  const pick = (kind, phase) => s.events.find(e => e.kind === kind && e.phase === phase);
  assert.deepEqual([pick('reg', 'written').start, pick('reg', 'written').end], ['2026-01-26', '2026-02-04']);
  assert.deepEqual([pick('exam', 'written').start, pick('exam', 'written').end], ['2026-01-27', '2026-02-05']);
  assert.deepEqual([pick('reg', 'practical').start, pick('reg', 'practical').end], ['2026-01-27', '2026-02-06']);
  assert.equal(pick('exam', 'practical').start, '2026-03-14');
  assert.equal(pick('result', 'practical').start, '2026-04-03');
});

test('2급 1차 시험은 기간이다 — 온라인 검정이라 그 안에서 응시일을 고른다', () => {
  const s = run().sessions.find(x => x.seq === 1);
  const exam = s.events.find(e => e.kind === 'exam' && e.phase === 'written');
  assert.notEqual(exam.start, exam.end);
  assert.deepEqual(exam.timing, {
    timezone: 'Asia/Seoul', status: 'select-on-booking', note: '온라인 시험 기간 내 응시',
  });
});

test('같은 공식 페이지의 2급 시험시간과 입실완료시간을 보존한다', () => {
  assert.deepEqual(parseGrade2Timings(page()), {
    '1차': {
      start: '14:00', end: '15:00', timezone: 'Asia/Seoul', status: 'confirmed', admissionDeadline: '13:50',
    },
    '2차': {
      start: '14:00', end: '15:40', timezone: 'Asia/Seoul', status: 'confirmed', admissionDeadline: '13:50',
    },
  });
  const exam = run().sessions.find(x => x.seq === 3).events
    .find(e => e.kind === 'exam' && e.phase === 'practical');
  assert.deepEqual(exam.timing, {
    start: '14:00', end: '15:40', timezone: 'Asia/Seoul', status: 'confirmed', admissionDeadline: '13:50',
  });
});

test('라벨이 1차·2차를 밝힌다 — 필기/실기로 오해하면 안 된다', () => {
  const s = run().sessions.find(x => x.seq === 1);
  assert.match(s.events.find(e => e.kind === 'exam' && e.phase === 'written').label, /^1차/);
  assert.match(s.events.find(e => e.kind === 'exam' && e.phase === 'practical').label, /^2차/);
});

// ---- 날짜가 아닌 값 ---------------------------------------------------

test('`시험종료 즉시` 로 날짜를 만들지 않는다', () => {
  const s = run().sessions.find(x => x.seq === 1);
  const r = s.events.find(e => e.kind === 'result' && e.phase === 'written');
  assert.equal(r, undefined, '발표일이 없는 것이 맞다');
  assert.equal(run().diagnostics.failures.length, 0, '미정 표기는 파싱 실패가 아니다');
});

test('발표일이 있는 회차는 만든다', () => {
  const s = run().sessions.find(x => x.seq === 3);
  assert.equal(s.events.find(e => e.kind === 'result' && e.phase === 'written').start, '2026-08-05');
});

// ---- 월 넘김 ---------------------------------------------------------

test('월을 넘기는 접수 기간을 바르게 읽는다', () => {
  const s = run().sessions.find(x => x.seq === 2);
  const reg = s.events.find(e => e.kind === 'reg' && e.phase === 'practical');
  assert.deepEqual([reg.start, reg.end], ['2026-04-28', '2026-05-08']);
});

// ---- 실패 처리 -------------------------------------------------------

test('헤더가 사라지면 headerMatch false — 다른 표를 조용히 읽지 않는다', () => {
  const html = '<html><body><table><tr><th>가</th><th>나</th></tr><tr><td>1</td><td>2</td></tr></table></body></html>';
  const r = parse(html, { year: 2026 });
  assert.equal(r.diagnostics.headerMatch, false);
  assert.deepEqual(r.sessions, []);
});

test('차수를 읽을 수 없으면 실패로 센다', () => {
  const r = run([['리눅스마스터', '2급', '2601회', '?', '01.26.(월) ~ 02.04.(수)', '03.14.(토)', '04.03.(금)']]);
  assert.equal(r.sessions.length, 0);
  assert.match(r.diagnostics.failures[0].reason, /차수/);
});

test('이벤트가 날짜순으로 정렬된다', () => {
  for (const s of run().sessions) {
    const starts = s.events.map(e => e.start);
    assert.deepEqual(starts, [...starts].sort(), s.id);
  }
});
