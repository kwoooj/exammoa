// node --test src/lib/urlState.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Exam, ExamPlan, Session } from '../types.ts';
import { decodePlans, encodePlans } from './urlState.ts';

const exam = (slug: string, groupId: string): Exam => ({
  slug, name: slug, short: null, groupId, jmCd: null, qualgbCd: null, series: null,
  category: 'it', tier: 'T1', priority: 1,
});

const session = (id: string, groupId: string, seq: number | null): Session => ({
  id, groupId, year: 2026, seq, label: null, mode: 'scheduled', status: 'confirmed', events: [],
});

const exams = [exam('정보처리기사', 'hrdk-regular'), exam('한국사능력검정시험', 'history-exam')];
const sessions = [
  session('hrdk-regular-2026-3', 'hrdk-regular', 3),
  session('hrdk-regular-2026-1', 'hrdk-regular', 1),
  session('history-exam-2026-77', 'history-exam', 77),
];

const plan = (over: Partial<ExamPlan> = {}): ExamPlan => ({
  examSlug: '정보처리기사', groupId: 'hrdk-regular', sessionId: 'hrdk-regular-2026-3',
  phase: 'written', ...over,
});

test('응시일까지 인코딩한다', () => {
  assert.equal(encodePlans([plan({ date: '2026-08-20' })], sessions), '정보처리기사|w|3|0820');
});

test('응시일이 없으면 자리를 비운다', () => {
  assert.equal(encodePlans([plan()], sessions), '정보처리기사|w|3|');
});

test('왕복해도 같다', () => {
  const before = [
    plan({ date: '2026-08-20' }),
    { examSlug: '한국사능력검정시험', groupId: 'history-exam', sessionId: 'history-exam-2026-77', phase: 'single' as const },
  ];
  const after = decodePlans(encodePlans(before, sessions), exams, sessions);
  assert.deepEqual(after, before);
});

test('회차를 구분한다', () => {
  const p = decodePlans('정보처리기사|w|1|', exams, sessions);
  assert.equal(p[0]!.sessionId, 'hrdk-regular-2026-1');
});

test('없는 종목은 버리고 나머지를 살린다', () => {
  const p = decodePlans('없는종목|w|3|,정보처리기사|w|3|0820', exams, sessions);
  assert.equal(p.length, 1);
  assert.equal(p[0]!.examSlug, '정보처리기사');
});

test('없는 회차는 버린다 — 링크가 오래돼 일정이 바뀐 경우', () => {
  assert.deepEqual(decodePlans('정보처리기사|w|9|', exams, sessions), []);
});

test('잘못된 단계 코드는 버린다', () => {
  assert.deepEqual(decodePlans('정보처리기사|z|3|', exams, sessions), []);
});

test('중복은 한 번만 담는다', () => {
  const p = decodePlans('정보처리기사|w|3|,정보처리기사|w|3|0820', exams, sessions);
  assert.equal(p.length, 1);
});

test('빈 문자열은 빈 배열', () => {
  assert.deepEqual(decodePlans('', exams, sessions), []);
});

test('망가진 입력에도 던지지 않는다', () => {
  for (const bad of ['|||', '정보처리기사', '정보처리기사|', ',,,', '정보처리기사|w|3|99']) {
    assert.doesNotThrow(() => decodePlans(bad, exams, sessions));
  }
});

test('MMDD 가 4자리가 아니면 응시일을 만들지 않는다', () => {
  const p = decodePlans('정보처리기사|w|3|8', exams, sessions);
  assert.equal(p[0]!.date, undefined, '추측한 날짜를 만들면 안 된다');
});

test('같은 종목의 필기와 실기를 함께 담는다', () => {
  const p = decodePlans('정보처리기사|w|3|0820,정보처리기사|p|3|1101', exams, sessions);
  assert.equal(p.length, 2);
  assert.deepEqual(p.map(x => x.phase), ['written', 'practical']);
});
