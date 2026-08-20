// node --test scripts/sources/kacpta-tax.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTilde, parse, TAX_EXAMS } from './kacpta-tax.mjs';

/** 실측 표 그대로. 구분자가 `~` 가 아니라 `∼`(U+223C) 다. */
const ROWS = [
  ['01.02 ∼ 01.08', '01.26 ∼ 01.31', '01.31(토)', '02.26(목)'],
  ['03.05 ∼ 03.11', '03.30 ∼ 04.04', '04.04(토)', '04.23(목)'],
  ['04.30 ∼ 05.07', '06.01 ∼ 06.06', '06.06(토)', '06.25(목)'],
  ['07.02∼ 07.08', '07.27 ∼ 08.01', '08.01(토)', '08.20(목)'],
  ['08.27 ∼ 09.02', '09.28 ∼ 10.03', '10.03(토)', '10.29(목)'],
  ['11.05 ∼11.11', '11. 30 ∼12.05', '12.05(토)', '12.24(목)'],
  ['', '', '', ''],
];

const HEAD = ['원서접수', '장소공고 수험표출력', '시험일자', '발표'];
const td = (cells, tag = 'td') => `<tr>${cells.map(c => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
const OFFICIAL = TAX_EXAMS.map(exam => ({
  category: exam.name.startsWith('전산') ? '전산세무회계' : exam.name.replace(/\s*[1-9]급$/, ''),
  grade: exam.name.startsWith('전산') ? exam.name.replace(' ', '') : exam.name.match(/[1-9]급$/)[0],
  time: `${exam.start} ∼ ${exam.end}`,
}));
const timingTable = (entries = OFFICIAL) => `<table>
${td(['종목', ...entries.map(entry => entry.category)], 'th')}
${td(['등급', ...entries.map(entry => entry.grade)])}
${td(['시험시간', ...entries.map(entry => entry.time)])}
</table>`;
const scheduleTable = (family, rows) => `<table>
${td([`종목 및 등급 ${family}`, ...HEAD], 'th')}
${rows.map(r => td(['', ...r])).join('')}
</table>`;
// 실제 페이지에는 표가 16개다. 앞에 관계없는 표를 두어 헤더로 고르는지 본다.
const page = (rows = ROWS, times = OFFICIAL, schedules = {
  전산세무회계: rows,
  세무회계: rows,
  기업회계: rows,
}) => `<html><body>
<table><tr><td>공지사항</td><td>2026-07-15</td></tr></table>
${Object.entries(schedules).map(([family, familyRows]) => scheduleTable(family, familyRows)).join('')}
${timingTable(times)}
</body></html>`;

const run = (rows, year = 2026) => parse(page(rows), { year });
const groupSessions = (result, groupId = 'kacpta-computer-tax-1') => result.sessions.filter(s => s.groupId === groupId);

// ---- 물결표 ----------------------------------------------------------

test('U+223C 물결표를 파서가 아는 형태로 바꾼다', () => {
  assert.equal(normalizeTilde('01.02 ∼ 01.08'), '01.02 ~ 01.08');
  assert.equal(normalizeTilde('01.02 〜 01.08'), '01.02 ~ 01.08');
  assert.equal(normalizeTilde('01.02 ～ 01.08'), '01.02 ~ 01.08');
  assert.equal(normalizeTilde(null), '');
});

// ---- 표 고르기 --------------------------------------------------------

test('16개 표 중 헤더로 고른다 — 인덱스로 고르면 개편 때 다른 표를 읽는다', () => {
  const r = run();
  assert.equal(r.diagnostics.headerMatch, true);
  assert.equal(r.sessions.length, 60, '10개 자격별 연 6회');
  assert.equal(r.diagnostics.coverage.discovered, 10);
  assert.equal(r.diagnostics.coverage.included, 10);
});

test('헤더가 사라지면 실패한다', () => {
  const r = parse('<html><body><table><tr><th>가</th></tr><tr><td>1</td></tr></table></body></html>', { year: 2026 });
  assert.equal(r.diagnostics.headerMatch, false);
  assert.deepEqual(r.sessions, []);
});

// ---- 날짜 -----------------------------------------------------------

test('첫 회차 날짜가 사이트와 일치한다', () => {
  const s = groupSessions(run())[0];
  const pick = (kind) => s.events.find(e => e.kind === kind);
  assert.deepEqual([pick('reg').start, pick('reg').end], ['2026-01-02', '2026-01-08']);
  assert.equal(pick('exam').start, '2026-01-31');
  assert.equal(pick('exam').end, '2026-01-31', '시험은 하루짜리다');
  assert.equal(pick('result').start, '2026-02-26');
});

test('공백이 끼어 있어도 읽는다 — `07.02∼ 07.08`·`11. 30 ∼12.05`', () => {
  const sessions = groupSessions(run());
  const reg4 = sessions[3].events.find(e => e.kind === 'reg');
  assert.deepEqual([reg4.start, reg4.end], ['2026-07-02', '2026-07-08']);
  assert.equal(sessions[5].events.find(e => e.kind === 'exam').start, '2026-12-05');
});

test('빈 행을 회차로 만들지 않는다', () => {
  const r = run();
  assert.equal(r.diagnostics.rows, 21);
  assert.equal(r.sessions.length, 60);
  assert.equal(r.diagnostics.failures.length, 0, '빈 행은 파싱 실패가 아니다');
});

// ---- 장소공고 칸 ------------------------------------------------------

test('장소공고·수험표출력을 접수로 만들지 않는다 — 추가접수와 성격이 다르다', () => {
  for (const s of run().sessions) {
    const regs = s.events.filter(e => e.kind === 'reg');
    assert.equal(regs.length, 1, `${s.label} 에 접수가 2건이면 D-Day 가 거짓이 된다`);
  }
  // 01.26 은 장소공고 시작일이다. 어떤 이벤트로도 들어오면 안 된다.
  const all = run().sessions.flatMap(s => s.events).map(e => e.start);
  assert.ok(!all.includes('2026-01-26'), '장소공고 날짜가 이벤트가 됐다');
});

// ---- 회차 번호 -------------------------------------------------------

test('회차 번호를 지어내지 않고 시험일로 라벨을 붙인다', () => {
  const labels = groupSessions(run()).map(s => s.label);
  assert.deepEqual(labels, ['01.31 시행', '04.04 시행', '06.06 시행', '08.01 시행', '10.03 시행', '12.05 시행']);
  assert.ok(!labels.some(l => /제\d+회/.test(l)), '표에 없는 회차 번호를 붙이면 안 된다');
});

test('seq 는 시험일 순서다 — sessionId 가 흔들리면 저장된 계획이 깨진다', () => {
  const r = run([ROWS[2], ROWS[0], ROWS[1]]); // 순서를 섞어 넣는다
  const sessions = groupSessions(r);
  assert.deepEqual(sessions.map(s => s.seq), [1, 2, 3]);
  assert.equal(sessions[0].id, 'kacpta-computer-tax-1-2026-1');
  assert.equal(sessions[0].events.find(e => e.kind === 'exam').start, '2026-01-31');
});

test('공식 10개 자격을 별도 그룹으로 만들고 서로 다른 시험시간을 보존한다', () => {
  const r = run([ROWS[0]]);
  assert.deepEqual(new Set(r.sessions.map(s => s.groupId)), new Set(TAX_EXAMS.map(exam => exam.groupId)));
  for (const target of TAX_EXAMS) {
    const exam = groupSessions(r, target.groupId)[0].events.find(event => event.kind === 'exam');
    assert.deepEqual([exam.timing.start, exam.timing.end], [target.start, target.end]);
  }
});

test('공식 시간표의 시각이 바뀌면 timingMatch가 실패한다', () => {
  const changed = OFFICIAL.map((entry, index) => index === 0 ? { ...entry, time: '15:30 ∼ 17:00' } : entry);
  const r = parse(page([ROWS[0]], changed), { year: 2026 });
  assert.equal(r.diagnostics.timingMatch, false);
  assert.equal(r.diagnostics.officialTimes[0].start, '15:30');
});

test('공식 시간표에 새 등급이 생기면 미분류로 감지한다', () => {
  const added = [...OFFICIAL, { category: '기업회계', grade: '4급', time: '09:30 ∼ 10:30' }];
  const r = parse(page([ROWS[0]], added), { year: 2026 });
  assert.deepEqual(r.diagnostics.coverage.unclassified, ['기업회계4급']);
  assert.equal(r.diagnostics.coverage.discovered, 11);
  assert.equal(r.diagnostics.coverage.included, 10);
});

test('세 자격군의 일정표를 각각 해당 종목에 적용한다', () => {
  const taxRows = [[...ROWS[0].slice(0, 2), '02.07(토)', '02.26(목)']];
  const r = parse(page([ROWS[0]], OFFICIAL, {
    전산세무회계: [ROWS[0]],
    세무회계: taxRows,
    기업회계: [ROWS[0]],
  }), { year: 2026 });
  const computer = groupSessions(r, 'kacpta-computer-tax-1')[0];
  const tax = groupSessions(r, 'kacpta-tax-accounting-1')[0];
  assert.equal(computer.events.find(event => event.kind === 'exam').start, '2026-01-31');
  assert.equal(tax.events.find(event => event.kind === 'exam').start, '2026-02-07');
});

test('세 자격군 일정표 중 하나가 사라지면 구조 실패다', () => {
  const r = parse(page([ROWS[0]], OFFICIAL, {
    전산세무회계: [ROWS[0]],
    세무회계: [ROWS[0]],
  }), { year: 2026 });
  assert.equal(r.diagnostics.headerMatch, false);
  assert.deepEqual(r.diagnostics.scheduleFamilies.sort(), ['computer', 'tax']);
});

// ---- 단계 -----------------------------------------------------------

test('단일 단계라 phase 는 single 이다', () => {
  for (const s of run().sessions) {
    assert.ok(s.events.every(e => e.phase === 'single'), s.label);
  }
});

test('이벤트가 날짜순으로 정렬된다', () => {
  for (const s of run().sessions) {
    const starts = s.events.map(e => e.start);
    assert.deepEqual(starts, [...starts].sort(), s.label);
  }
});
