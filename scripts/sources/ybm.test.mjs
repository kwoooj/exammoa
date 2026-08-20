// node --test scripts/sources/ybm.test.mjs
//
// 고정 데이터는 `data/archive/2026/toeic*.2026-08-13.*.html` 에서 그대로 옮겼다.
// 전에는 `build/crawl/*.html` 을 읽고 없으면 `return` 했는데, 그 경로가 `.gitignore`
// 대상이라 **CI 에서는 5건이 조용히 통과했다.**

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitReg, toeic, toeicSpeaking } from './ybm.mjs';

const td = (cells, tag = 'td') => `<tr>${cells.map(c => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
const page = (headers, rows) =>
  `<html><body><table>${td(headers, 'th')}${rows.map(r => td(r)).join('')}</table></body></html>`;

// ---- TOEIC ------------------------------------------------------------
//
// 회차 칸이 있고, 접수기간 한 칸에 정기접수와 특별추가가 함께 들어온다.
// `★ 제576회` 처럼 별표가 붙는 회차가 실제로 있다.

const TOEIC_HEADERS = ['회차', '시험일시', '성적발표일시', '접수기간'];
const TOEIC_ROWS = [
  ['제575회', '2026.08.09 (일) 09:20', '2026.08.18 (화) 12:00', '정기접수 : 2026.06.22 (월) 10:00~2026.07.27 (월) 10:00 특별추가 : 2026.07.29 (수) 10:00~2026.08.06 (목) 13:00'],
  ['★ 제576회', '2026.08.23 (일) 09:20', '2026.09.03 (목) 12:00', '정기접수 : 2026.07.06 (월) 10:00~2026.08.10 (월) 10:00 특별추가 : 2026.08.12 (수) 10:00~2026.08.20 (목) 13:00'],
  ['★ 제577회', '2026.08.30 (일) 09:20', '2026.09.08 (화) 12:00', '정기접수 : 2026.07.13 (월) 10:00~2026.08.17 (월) 10:00 특별추가 : 2026.08.19 (수) 10:00~2026.08.27 (목) 13:00'],
  ['제578회', '2026.09.06 (일) 09:20', '2026.09.15 (화) 12:00', '정기접수 : 2026.07.20 (월) 10:00~2026.08.24 (월) 10:00 특별추가 : 2026.08.26 (수) 10:00~2026.09.03 (목) 13:00'],
  ['제581회', '2026.10.31 (토) 09:20', '2026.11.10 (화) 12:00', '정기접수 : 2026.09.14 (월) 10:00~2026.10.19 (월) 10:00 특별추가 : 2026.10.21 (수) 10:00~2026.10.28 (수) 13:00'],
];
const toeicPage = (rows = TOEIC_ROWS) => page(TOEIC_HEADERS, rows);

// ---- TOEIC Speaking ---------------------------------------------------
//
// 회차 칸이 **없고**, 같은 시험일이 여러 행에 중복된다 (지역·시간대).

const TOS_HEADERS = ['시험일시', '성적발표일', '접수기간'];
const TOS_ROWS = [
  ['2026.08.02 (일)', '2026.08.07 (금) 12:00', '2026.06.29 (월) 10:00~2026.07.30 (목) 10:00'],
  ['2026.08.02 (일)', '2026.08.07 (금) 12:00', '2026.06.29 (월) 10:00~2026.07.30 (목) 10:00'],
  ['2026.08.02 (일)', '2026.08.07 (금) 12:00', '2026.06.29 (월) 10:00~2026.07.30 (목) 10:00'],
  ['2026.08.05 (수)', '2026.08.11 (화) 12:00', '2026.07.20 (월) 10:00~2026.08.02 (일) 10:00'],
  ['2026.08.08 (토)', '2026.08.13 (목) 12:00', '2026.07.06 (월) 10:00~2026.08.05 (수) 10:00'],
  ['2026.08.15 (토)', '2026.08.20 (목) 12:00', '2026.07.13 (월) 10:00~2026.08.12 (수) 10:00'],
];
const tosPage = (rows = TOS_ROWS) => page(TOS_HEADERS, rows);

// ---- 접수기간 쪼개기 ---------------------------------------------------

test('접수기간 칸을 정기·특별추가로 나눈다', () => {
  const parts = splitReg(TOEIC_ROWS[0][3]);
  assert.equal(parts.length, 2);
  assert.equal(parts[0].seq, 1);
  assert.match(parts[0].text, /^2026\.06\.22/);
  assert.ok(!parts[0].text.includes('특별추가'), '정기 구간에 특별추가가 섞였다');
  assert.equal(parts[1].seq, 2);
  assert.match(parts[1].text, /^2026\.07\.29/);
});

test('라벨이 없으면 칸 전체가 하나의 접수기간이다 (토스)', () => {
  const parts = splitReg(TOS_ROWS[0][2]);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].seq, 1);
});

test('특별추가만 있어도 읽는다', () => {
  const parts = splitReg('특별추가 : 2026.07.29 (수) 10:00~2026.08.06 (목) 13:00');
  assert.equal(parts.length, 1);
  assert.equal(parts[0].seq, 2);
});

// ---- TOEIC ------------------------------------------------------------

test('TOEIC — 회차를 뽑고 정기·특별추가를 나눈다', () => {
  const { sessions, diagnostics } = toeic.parse(toeicPage(), { year: 2026 });
  assert.equal(diagnostics.headerMatch, true);
  assert.equal(sessions.length, 5);

  const s575 = sessions.find(s => s.seq === 575);
  assert.ok(s575, '제575회를 찾지 못했다');
  assert.equal(s575.events.find(e => e.kind === 'exam').start, '2026-08-09');
  assert.equal(s575.events.find(e => e.kind === 'result').start, '2026-08-18');

  const regs = s575.events.filter(e => e.kind === 'reg').sort((a, b) => a.seq - b.seq);
  assert.equal(regs.length, 2, '정기 + 특별추가 두 건이어야 한다');
  assert.deepEqual([regs[0].start, regs[0].end], ['2026-06-22', '2026-07-27']);
  assert.equal(regs[1].seq, 2);
  assert.equal(regs[1].note, '특별추가접수');
});

test('TOEIC — ★ 가 붙은 회차도 읽는다', () => {
  const { sessions } = toeic.parse(toeicPage(), { year: 2026 });
  assert.ok(sessions.some(s => s.seq === 576), '★ 제576회를 놓쳤다');
  assert.ok(sessions.some(s => s.seq === 577));
});

test('TOEIC — 회차 번호를 순서가 아니라 표기에서 가져온다', () => {
  // 575·576·577·578·581 — 581 이 5번째 행이지만 seq 는 581 이다
  const { sessions } = toeic.parse(toeicPage(), { year: 2026 });
  assert.deepEqual(sessions.map(s => s.seq), [575, 576, 577, 578, 581]);
  assert.equal(sessions.at(-1).label, '제581회');
});

test('TOEIC — 시험은 하루짜리다', () => {
  for (const s of toeic.parse(toeicPage(), { year: 2026 }).sessions) {
    const e = s.events.find(x => x.kind === 'exam');
    assert.equal(e.start, e.end, `${s.label} 시험이 기간으로 잡혔다`);
  }
});

test('TOEIC — 시험·접수·발표 시각을 보존한다', () => {
  const s = toeic.parse(toeicPage(), { year: 2026 }).sessions.find(x => x.seq === 575);
  assert.deepEqual(s.events.find(e => e.kind === 'exam').timing, {
    start: '09:20', timezone: 'Asia/Seoul', status: 'confirmed',
  });
  assert.deepEqual(s.events.find(e => e.kind === 'reg' && e.seq === 1).timing, {
    start: '10:00', end: '10:00', timezone: 'Asia/Seoul', status: 'confirmed',
  });
  assert.deepEqual(s.events.find(e => e.kind === 'reg' && e.seq === 2).timing, {
    start: '10:00', end: '13:00', timezone: 'Asia/Seoul', status: 'confirmed',
  });
  assert.deepEqual(s.events.find(e => e.kind === 'result').timing, {
    start: '12:00', timezone: 'Asia/Seoul', status: 'confirmed',
  });
});

test('TOEIC Speaking — 단일 시각을 지어내지 않고 접수 시 선택 상태를 보존한다', () => {
  const s = toeicSpeaking.parse(tosPage(), { year: 2026 }).sessions[0];
  assert.deepEqual(s.events.find(e => e.kind === 'exam').timing, {
    timezone: 'Asia/Seoul', status: 'select-on-booking', note: '접수할 때 시험시간 선택',
  });
  assert.equal(s.events.find(e => e.kind === 'result').timing.start, '12:00');
  assert.deepEqual(s.events.find(e => e.kind === 'reg').timing, {
    start: '10:00', end: '10:00', timezone: 'Asia/Seoul', status: 'confirmed',
  });
});

test('TOEIC — 파싱 실패가 0건이다', () => {
  assert.deepEqual(toeic.parse(toeicPage(), { year: 2026 }).diagnostics.failures, []);
});

// ---- TOEIC Speaking ---------------------------------------------------

test('TOEIC Speaking — 회차 컬럼이 없어도 시험일 순서로 회차를 만든다', () => {
  const { sessions, diagnostics } = toeicSpeaking.parse(tosPage(), { year: 2026 });
  assert.equal(diagnostics.headerMatch, true);
  assert.deepEqual(sessions.map(s => s.seq), [1, 2, 3, 4]);
  assert.equal(sessions[0].label, '08.02 시행', '없는 회차 번호를 지어내지 않는다');
});

test('TOEIC Speaking — 같은 시험일 중복 행을 하나로 접는다', () => {
  const { sessions, diagnostics } = toeicSpeaking.parse(tosPage(), { year: 2026 });
  assert.equal(diagnostics.rows, 6);
  assert.equal(sessions.length, 4, '08.02 세 행이 한 회차가 되어야 한다');
  const dates = sessions.map(s => s.events.find(e => e.kind === 'exam').start);
  assert.equal(new Set(dates).size, dates.length, '같은 시험일이 두 회차로 나왔다');
});

test('TOEIC Speaking — 접수기간이 한 건이다', () => {
  for (const s of toeicSpeaking.parse(tosPage(), { year: 2026 }).sessions) {
    assert.equal(s.events.filter(e => e.kind === 'reg').length, 1, s.label);
  }
});

test('TOEIC Speaking — 행 순서가 뒤섞여도 시험일 순으로 매긴다', () => {
  const shuffled = [TOS_ROWS[5], TOS_ROWS[3], TOS_ROWS[0]];
  const { sessions } = toeicSpeaking.parse(tosPage(shuffled), { year: 2026 });
  assert.deepEqual(
    sessions.map(s => s.events.find(e => e.kind === 'exam').start),
    ['2026-08-02', '2026-08-05', '2026-08-15'],
  );
  assert.deepEqual(sessions.map(s => s.seq), [1, 2, 3]);
});

// ---- 공통 -------------------------------------------------------------

test('회차가 날짜순으로 정렬된다', () => {
  for (const [src, html, name] of [[toeic, toeicPage(), 'toeic'], [toeicSpeaking, tosPage(), 'toeic-speaking']]) {
    const dates = src.parse(html, { year: 2026 }).sessions.map(s => s.events.find(e => e.kind === 'exam').start);
    assert.deepEqual(dates, [...dates].sort(), `${name} 정렬이 어긋났다`);
  }
});

test('헤더가 바뀌면 빈 결과 + headerMatch false', () => {
  for (const src of [toeic, toeicSpeaking]) {
    const { sessions, diagnostics } = src.parse('<table><tr><th>x</th></tr></table>', { year: 2026 });
    assert.deepEqual(sessions, []);
    assert.equal(diagnostics.headerMatch, false);
  }
});

test('빈 입력에도 던지지 않는다', () => {
  for (const src of [toeic, toeicSpeaking]) {
    for (const bad of ['', null, undefined]) {
      assert.doesNotThrow(() => src.parse(bad, { year: 2026 }));
    }
  }
});

test('기대 헤더가 실측 표와 같다', () => {
  assert.deepEqual(toeic.EXPECT_HEADERS, TOEIC_HEADERS);
  assert.deepEqual(toeicSpeaking.EXPECT_HEADERS, TOS_HEADERS);
});
