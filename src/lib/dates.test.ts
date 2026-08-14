// node --test src/lib/dates.test.ts
//
// dates.ts 는 지금까지 테스트가 없었다. calendar/plan/timeline 테스트가 간접적으로
// 덮고 있었을 뿐이다. 화면 문구를 만드는 함수가 붙는 김에 직접 건다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, dDay, diffDays, dotted, monthDay, rangeLabel, weekStart } from './dates.ts';

// ---- rangeLabel (§16.2) -----------------------------------------------

test('단독 날짜는 점으로 잇는다', () => {
  assert.equal(rangeLabel('2026-09-12', '2026-09-12'), '2026.09.12');
});

test('같은 연도 기간은 뒤에서 연도를 생략한다', () => {
  // 2026.09.21 ~ 2026.10.19 는 같은 정보를 두 번 읽게 하고, 목록에서는 그 폭
  // 때문에 시험명이 밀린다.
  assert.equal(rangeLabel('2026-09-21', '2026-10-19'), '2026.09.21 ~ 10.19');
});

test('같은 달 기간도 같은 규칙이다', () => {
  assert.equal(rangeLabel('2026-09-21', '2026-09-25'), '2026.09.21 ~ 09.25');
});

test('목록용 짧은 날짜는 앞 연도도 뗀다', () => {
  assert.equal(rangeLabel('2026-09-21', '2026-10-19', 'short'), '09.21 ~ 10.19');
  assert.equal(rangeLabel('2026-09-12', '2026-09-12', 'short'), '09.12');
});

test('해를 넘기는 기간은 뒤쪽 연도를 적는다', () => {
  // 생략하면 12.28 ~ 01.05 가 되어 과거로 거슬러 가는 것처럼 읽힌다.
  assert.equal(rangeLabel('2026-12-28', '2027-01-05'), '2026.12.28 ~ 2027.01.05');
  assert.equal(rangeLabel('2026-12-28', '2027-01-05', 'short'), '12.28 ~ 2027.01.05');
});

test('읽어 주는 문구는 숫자를 날짜로 풀어 쓴다', () => {
  // "09.21" 을 그대로 읽으면 날짜로 들리지 않는다.
  assert.equal(rangeLabel('2026-09-21', '2026-10-19', 'spoken'), '9월 21일부터 10월 19일까지');
  assert.equal(rangeLabel('2026-09-12', '2026-09-12', 'spoken'), '9월 12일');
});

// ---- 기존 함수의 경계값 -----------------------------------------------

test('점 표기는 하이픈만 바꾼다', () => {
  assert.equal(dotted('2026-08-13'), '2026.08.13');
});

test('월일 표기', () => {
  assert.equal(monthDay('2026-10-11'), '10월 11일');
  assert.equal(monthDay('2026-01-01'), '1월 1일');
});

test('D-Day 는 미래가 양수다', () => {
  assert.equal(dDay('2026-08-16', '2026-08-14'), 2);
  assert.equal(dDay('2026-08-14', '2026-08-14'), 0);
  assert.equal(dDay('2026-08-13', '2026-08-14'), -1);
});

test('윤년을 건너뛰지 않는다', () => {
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2028-02-29', 1), '2028-03-01');
  assert.equal(diffDays('2028-03-01', '2028-02-28'), 2);
});

test('평년 2월은 29일이 없다', () => {
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
});

test('주 시작은 월요일이다', () => {
  // 시험이 대부분 주말에 치러지므로 토·일이 한 주 끝에 붙어야 읽기 좋다.
  assert.equal(weekStart('2026-10-19'), '2026-10-19'); // 월요일
  assert.equal(weekStart('2026-10-25'), '2026-10-19'); // 일요일
  assert.equal(weekStart('2026-10-18'), '2026-10-12');
});

test('연말연시를 넘어가는 계산', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(diffDays('2027-01-01', '2026-12-31'), 1);
});
