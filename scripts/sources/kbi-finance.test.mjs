import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse, TARGETS } from './kbi-finance.mjs';

const row = (code, seq, reg, exam, result, period) => ({
  I_QLFN: code,
  N_QLFN: TARGETS[code]?.name ?? '신규 자격',
  D_YY: '2026',
  Q_SEQ: String(seq),
  D_INT_ACPT_DT: reg,
  D_OF_APPR: exam,
  D_SUCC_ANNO: result,
  EAXM_PERIOD: period,
});

const payload = (rows = [
  row('01', 66, '09.22 (화)~09.29 (화)', '10.31 (토)', '11.13 (금)', '09:00 ~ 15:30'),
  row('04', 69, '10.06 (화)~10.13 (화)', '11.14 (토)', '11.27 (금)', '09:00 ~ 12:40'),
  row('09', 57, '10.13 (화)~10.20 (화)', '11.21 (토)', '12.04 (금)', '10:00 ~ 12:00'),
  row('10', 57, '10.13 (화)~10.20 (화)', '11.21 (토)', '12.04 (금)', '13:00 ~ 15:00'),
]) => JSON.stringify({
  schedulePage: '<th>원서접수<br>(시작일 10:00~<br>마감일 20:00)</th>',
  api: { ds: rows },
});

test('한국금융연수원 자격을 서로 다른 그룹으로 만든다', () => {
  const { sessions, diagnostics } = parse(payload(), { year: 2026 });
  assert.equal(diagnostics.headerMatch, true);
  assert.equal(sessions.length, 4);
  assert.equal(new Set(sessions.map(session => session.groupId)).size, 4);
});

test('공식 접수시간과 종목별 시험시간을 보존한다', () => {
  const { sessions } = parse(payload(), { year: 2026 });
  const credit = sessions.find(session => session.groupId === 'kbi-credit-analyst');
  assert.deepEqual(credit.events.find(event => event.kind === 'reg').timing, {
    start: '10:00', end: '20:00', timezone: 'Asia/Seoul', status: 'confirmed',
  });
  assert.deepEqual(credit.events.find(event => event.kind === 'exam').timing, {
    start: '09:00', end: '15:30', timezone: 'Asia/Seoul', status: 'confirmed',
  });
  assert.equal(credit.events.find(event => event.kind === 'result').timing, undefined);
});

test('필수 종목이나 접수시간 구조가 사라지면 개편 신호로 실패한다', () => {
  const missing = JSON.stringify({ schedulePage: '<p>시험일정</p>', api: { ds: [row('01', 66, '09.22~09.29', '10.31', '11.13', '09:00~15:30')] } });
  const { diagnostics } = parse(missing, { year: 2026 });
  assert.equal(diagnostics.headerMatch, false);
});

test('공식 보관 원본의 18개 코드를 전부 수집한다', async () => {
  const raw = await readFile('data/archive/2026/kbi-finance.2026-08-20.00c181b531c6.json', 'utf8');
  const { sessions, diagnostics } = parse(raw, { year: 2026 });
  assert.equal(sessions.length, 37);
  assert.equal(new Set(sessions.map(session => session.groupId)).size, 18);
  assert.equal(diagnostics.coverage.discovered, 18);
  assert.equal(diagnostics.coverage.included, 18);
  assert.deepEqual(diagnostics.coverage.unclassified, []);
  assert.deepEqual(diagnostics.coverage.missing, []);
});

test('새 코드나 공식 명칭 변경을 무음 제외하지 않는다', () => {
  const unknown = row('99', 1, '01.01~01.02', '02.01', '02.02', '10:00~11:00');
  const renamed = { ...row('01', 1, '01.01~01.02', '02.01', '02.02', '10:00~11:00'), N_QLFN: '신용분석사 개편' };
  const { diagnostics } = parse(payload([unknown, renamed]), { year: 2026 });
  assert.equal(diagnostics.coverage.unclassified.length, 2);
  assert.ok(diagnostics.coverage.missing.length > 0);
});

test('공식 API의 접수일 미공고 표기 `~`는 날짜를 만들거나 실패로 세지 않는다', () => {
  const target = row('25', 92, '~', '10.24 (토)', '11.13 (금)', '09:00~12:00');
  const { sessions, diagnostics } = parse(payload([target]), { year: 2026 });
  assert.equal(sessions[0].events.some(event => event.kind === 'reg'), false);
  assert.deepEqual(diagnostics.failures, []);
});

test('종목 행의 회차가 비정상이면 coverage에만 포함하고 조용히 버리지 않는다', () => {
  const invalid = row('01', '미정', '09.22~09.29', '10.31', '11.13', '09:00~15:30');
  const { sessions, diagnostics } = parse(payload([invalid]), { year: 2026 });
  assert.equal(sessions.length, 0);
  assert.equal(diagnostics.coverage.discovered, 1);
  assert.equal(diagnostics.coverage.included, 1);
  assert.deepEqual(diagnostics.failures, [{
    seq: '미정', label: TARGETS['01'].name, reason: 'invalid-sequence', raw: '미정',
  }]);
});

test('깨진 응답은 던지지 않고 실패한다', () => {
  const result = parse('not-json', { year: 2026 });
  assert.equal(result.diagnostics.headerMatch, false);
  assert.deepEqual(result.sessions, []);
});
