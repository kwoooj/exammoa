// node --test scripts/sources/history-exam.test.mjs
//
// 고정 데이터는 `data/archive/2026/history-exam.2026-08-13.*.html` 에서 그대로 옮겼다.
//
// 전에는 `build/crawl/history-exam.html` 을 읽고 없으면 `return` 했다. 그 경로가
// `.gitignore` 대상이라 **CI 에서는 파일이 없고, 6건이 조용히 통과했다.** 초록불이
// 아무것도 확인하지 않는 상태였다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXAM_START, EXPECT_HEADERS, parse } from './history-exam.mjs';

/** 실측 5행 그대로 */
const ROWS = [
  ['제77회', '2026년 1월 6일(화) 10:00 ~ 2026년 1월 13일(화) 17:00', '2026년 1월 20일(화) 10:00 ~ 2026년 1월 23일(금) 17:00', '2026년 2월 7일(토)', '2026년 2월 20일(금)'],
  ['제78회', '2026년 4월 21일(화) 10:00 ~ 2026년 4월 28일(화) 17:00', '2026년 5월 5일(화) 10:00 ~ 2026년 5월 8일(금) 17:00', '2026년 5월 23일(토)', '2026년 6월 5일(금)'],
  ['제79회', '2026년 7월 7일(화) 10:00 ~ 2026년 7월 14일(화) 17:00', '2026년 7월 21일(화) 10:00 ~ 2026년 7월 24일(금) 17:00', '2026년 8월 9일(일)', '2026년 8월 21일(금)'],
  ['제80회', '2026년 9월 15일(화) 10:00 ~ 2026년 9월 22일(화) 17:00', '2026년 9월 29일(화) 10:00 ~ 2026년 10월 2일(금) 17:00', '2026년 10월 17일(토)', '2026년 10월 30일(금)'],
  ['제81회', '2026년 11월 3일(화) 10:00 ~ 2026년 11월 10일(화) 17:00', '2026년 11월 11일(수) 13:00 ~ 2026년 11월 13일(금) 17:00', '2026년 11월 28일(토)', '2026년 12월 11일(금)'],
];

const td = (cells, tag = 'td') => `<tr>${cells.map(c => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
const page = (rows = ROWS) =>
  `<html><body><table>${td(EXPECT_HEADERS, 'th')}${rows.map(r => td(r)).join('')}</table></body></html>`;

const run = (rows) => parse(page(rows), { year: 2026 });

// ---- 회차 -------------------------------------------------------------

test('5회차를 뽑는다', () => {
  const { sessions, diagnostics } = run();
  assert.equal(diagnostics.headerMatch, true);
  assert.equal(sessions.length, 5);
  assert.deepEqual(sessions.map(s => s.seq), [77, 78, 79, 80, 81]);
});

test('파싱 실패가 0건이다', () => {
  assert.deepEqual(run().diagnostics.failures, [], '실패가 있으면 표기 형식이 바뀐 것이다');
});

test('제77회 날짜가 사이트와 일치한다', () => {
  const s = run().sessions.find(x => x.seq === 77);
  const pick = (kind, seq = 1) => s.events.find(e => e.kind === kind && e.seq === seq);
  assert.deepEqual([pick('reg').start, pick('reg').end], ['2026-01-06', '2026-01-13']);
  assert.deepEqual([pick('reg', 2).start, pick('reg', 2).end], ['2026-01-20', '2026-01-23']);
  assert.equal(pick('exam').start, '2026-02-07');
  assert.equal(pick('exam').end, '2026-02-07', '시험은 하루짜리다');
  assert.equal(pick('result').start, '2026-02-20');
});

test('월을 넘기는 취소좌석 접수를 바르게 읽는다 (제80회 9/29~10/2)', () => {
  const s = run().sessions.find(x => x.seq === 80);
  const extra = s.events.find(e => e.kind === 'reg' && e.seq === 2);
  assert.deepEqual([extra.start, extra.end], ['2026-09-29', '2026-10-02']);
});

test('접수 시작·마감 시각을 보존하고 날짜 필드는 날짜로 유지한다', () => {
  for (const s of run().sessions) {
    for (const e of s.events) {
      assert.match(e.start, /^\d{4}-\d{2}-\d{2}$/, `${s.label} ${e.label}`);
      assert.match(e.end, /^\d{4}-\d{2}-\d{2}$/);
    }
  }
  const s = run().sessions.find(x => x.seq === 81);
  assert.deepEqual(s.events.find(e => e.kind === 'reg' && e.seq === 1).timing, {
    start: '10:00', end: '17:00', timezone: 'Asia/Seoul', status: 'confirmed',
  });
  assert.deepEqual(s.events.find(e => e.kind === 'reg' && e.seq === 2).timing, {
    start: '13:00', end: '17:00', timezone: 'Asia/Seoul', status: 'confirmed',
  });
  assert.equal(EXAM_START, '10:00');
  assert.deepEqual(s.events.find(e => e.kind === 'exam').timing, {
    start: '10:00', timezone: 'Asia/Seoul', status: 'confirmed',
  });
});

// ---- 취소좌석 접수 -----------------------------------------------------

test('취소좌석 접수는 seq 2 다 — 정기접수 마감과 구분되어야 한다', () => {
  for (const s of run().sessions) {
    const regs = s.events.filter(e => e.kind === 'reg').sort((a, b) => a.seq - b.seq);
    assert.equal(regs.length, 2, s.label);
    assert.deepEqual(regs.map(e => e.seq), [1, 2]);
    assert.equal(regs[1].note, '취소좌석접수');
    assert.equal(regs[0].note, null, '정기접수에는 꼬리표를 달지 않는다');
  }
});

test('취소좌석이 정기보다 늦게 시작한다 — 순서가 뒤집히면 마감 계산이 틀린다', () => {
  for (const s of run().sessions) {
    const [a, b] = s.events.filter(e => e.kind === 'reg').sort((x, y) => x.seq - y.seq);
    assert.ok(b.start >= a.start, `${s.label} 취소좌석(${b.start})이 정기(${a.start})보다 빠르다`);
  }
});

// ---- 형태 -------------------------------------------------------------

test('phase 는 전부 single 이다 — 한능검은 필기·실기 구분이 없다', () => {
  for (const s of run().sessions) for (const e of s.events) assert.equal(e.phase, 'single');
});

test('이벤트가 날짜순으로 정렬된다', () => {
  for (const s of run().sessions) {
    const dates = s.events.map(e => e.start);
    assert.deepEqual(dates, [...dates].sort(), `${s.label} 정렬이 어긋났다`);
  }
});

test('id 와 label 이 회차를 따른다', () => {
  const s = run().sessions.find(x => x.seq === 79);
  assert.equal(s.id, 'history-exam-2026-79');
  assert.equal(s.label, '제79회');
  assert.equal(s.groupId, 'history-exam');
});

// ---- 실패 처리 ---------------------------------------------------------

test('회차 표기가 아닌 행은 담지 않는다', () => {
  const { sessions } = run([...ROWS, ['안내', '-', '-', '-', '-']]);
  assert.equal(sessions.length, 5);
});

test('날짜가 아닌 값으로 이벤트를 만들지 않는다', () => {
  const { sessions } = run([['제99회', '미정', '미정', '미정', '미정']]);
  assert.equal(sessions.length, 0, '만들 이벤트가 없으면 회차도 없다');
});

test('헤더가 바뀌면 조용히 다른 표를 읽지 않고 빈 결과를 낸다', () => {
  const { sessions, diagnostics } = parse('<table><tr><th>가</th></tr><tr><td>1</td></tr></table>', { year: 2026 });
  assert.deepEqual(sessions, []);
  assert.equal(diagnostics.headerMatch, false);
});

test('빈 입력에도 던지지 않는다', () => {
  for (const bad of ['', null, undefined, '<html></html>']) {
    assert.doesNotThrow(() => parse(bad, { year: 2026 }));
  }
});

test('기대 헤더가 실측 표와 같다', () => {
  assert.deepEqual(EXPECT_HEADERS, ['구분', '원서접수', '취소좌석 접수', '시험일시', '합격자발표']);
});
