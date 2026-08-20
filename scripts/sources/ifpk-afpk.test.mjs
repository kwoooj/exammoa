import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from './ifpk-afpk.mjs';

const page = `
  <h2>2026년도 AFPK 자격시험 일정</h2>
  <h3>2026년도 제1차 (93회) AFPK 자격시험</h3>
  <p>시행일 : 2026년 3월 21일 (토) 오후 02:00 ~ 2026년 3월 21일 (토) 오후 06:00</p>
  <p>원서접수 2월 23일 (월) 오전 09:00 부터 3월 9일 (월) 오후 08:00 까지</p>
  <p>원서접수 변경 3월 13일 (금) 오후 06:00 까지</p>
  <p>결과 발표 4월 10일 (금) 오전 09:00</p>
  <h3>2026년도 제2차 (94회) AFPK 자격시험</h3>
  <p>시행일 : 2026년 8월 22일 (토) 오후 02:00 ~ 2026년 8월 22일 (토) 오후 05:20</p>
  <p>원서접수 7월 27일 (월) 오전 09:00 부터 8월 10일 (월) 오후 08:00 까지</p>
  <p>원서접수 변경 8월 14일 (금) 오후 06:00 까지</p>
  <p>결과 발표 9월 11일 (금) 오전 09:00</p>
  <h3>2026년도 제3차 (95회) AFPK 자격시험</h3>
  <p>시행일 : 2026년 11월 21일 (토) 오후 02:00 ~ 2026년 11월 21일 (토) 오후 05:20</p>
  <p>원서접수 10월 26일 (월) 오전 09:00 부터 11월 9일 (월) 오후 08:00 까지</p>
  <p>원서접수 변경 11월 13일 (금) 오후 06:00 까지</p>
  <p>결과 발표 12월 11일 (금) 오전 09:00</p>
  <p>시험 일정은 한국재무설계협회의 사정에 의해 변경될 수 있습니다.</p>
`;

test('AFPK 2026년 3회차를 읽는다', () => {
  const { sessions, diagnostics } = parse(page, { year: 2026 });
  assert.equal(diagnostics.headerMatch, true);
  assert.deepEqual(sessions.map(session => session.seq), [93, 94, 95]);
});

test('AFPK 접수·시험·발표 시간을 공식 표기대로 보존한다', () => {
  const { sessions } = parse(page, { year: 2026 });
  const second = sessions.find(session => session.seq === 94);
  assert.deepEqual(second.events.find(event => event.kind === 'reg').timing, {
    start: '09:00', end: '20:00', timezone: 'Asia/Seoul', status: 'confirmed',
  });
  assert.deepEqual(second.events.find(event => event.kind === 'exam').timing, {
    start: '14:00', end: '17:20', timezone: 'Asia/Seoul', status: 'confirmed',
  });
  assert.deepEqual(second.events.find(event => event.kind === 'result').timing, {
    start: '09:00', timezone: 'Asia/Seoul', status: 'confirmed',
  });
});

test('세 회차 중 일부가 사라지면 개편 신호로 실패한다', () => {
  const result = parse(page.replace(/2026년도 제3차[\s\S]*$/, ''), { year: 2026 });
  assert.equal(result.diagnostics.headerMatch, false);
});
