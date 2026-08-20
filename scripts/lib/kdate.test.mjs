// node --test scripts/lib/kdate.test.mjs
//
// 입력은 실제 기관 페이지에서 뽑은 문자열이다. 날짜를 추측해 만들어내지 않는 것이
// 이 파서의 유일한 계약이므로, 실패해야 하는 경우를 성공 케이스보다 꼼꼼히 본다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRealDate, parseCell, parseClock, parseRange, parseTiming, tryParseRange, yearFromHeading } from './kdate.mjs';

const r = (t, ctx) => parseRange(t, ctx);

// ---- 연도가 있는 표기 --------------------------------------------------

test('2026.08.09', () => {
  assert.deepEqual(r('2026.08.09'), { start: '2026-08-09', end: '2026-08-09' });
});

test('ISO 하이픈과 컴팩트 8자리', () => {
  assert.deepEqual(r('2026-08-19'), { start: '2026-08-19', end: '2026-08-19' });
  assert.deepEqual(r('20260809'), { start: '2026-08-09', end: '2026-08-09' });
});

test('0 패딩이 없어도 된다', () => {
  assert.deepEqual(r('2026.2.7'), { start: '2026-02-07', end: '2026-02-07' });
});

test('한능검 실측 — 요일과 시각이 붙은 범위', () => {
  // 시각의 콜론과 ~ 를 날짜 범위로 오인하면 안 된다
  const t = '2026년 1월 6일(화) 10:00 ~ 2026년 1월 13일(화) 17:00';
  assert.deepEqual(r(t), { start: '2026-01-06', end: '2026-01-13' });
});

test('한능검 실측 — 하루짜리 시험일', () => {
  assert.deepEqual(r('2026년 2월 7일(토)'), { start: '2026-02-07', end: '2026-02-07' });
});

test('KBS 실측 — 일 뒤 마침표와 오전·오후', () => {
  const t = '2026.01.05. (월) 오전 09:00 ~ 2026.02.06. (금) 오후  06:00';
  assert.deepEqual(r(t), { start: '2026-01-05', end: '2026-02-06' });
});

test('공식 시각을 24시간제 메타데이터로 보존한다', () => {
  assert.deepEqual(
    parseTiming('2026.01.05. (월) 오전 09:00 ~ 2026.02.06. (금) 오후 06:00'),
    { start: '09:00', end: '18:00', timezone: 'Asia/Seoul', status: 'confirmed' },
  );
  assert.deepEqual(
    parseTiming('2026.08.23. (일) 오전 10:00'),
    { start: '10:00', timezone: 'Asia/Seoul', status: 'confirmed' },
  );
});

test('24시간제와 초가 붙은 시각을 읽는다', () => {
  assert.equal(parseClock('시험시작시간 09:20:00'), '09:20');
  assert.equal(parseClock('성적발표 12:00'), '12:00');
  assert.equal(parseClock('시각 없음'), null);
});

test('잘못된 시각은 만들지 않는다', () => {
  assert.equal(parseClock('오후 13:00'), null);
  assert.equal(parseClock('25:00'), null);
  assert.equal(parseClock('09:61'), null);
});

test('2자리 연도', () => {
  assert.deepEqual(r("'26.01.24."), { start: '2026-01-24', end: '2026-01-24' });
});

// ---- 연도 없는 표기 ----------------------------------------------------

test('리눅스마스터 실측 — 연도를 문맥에서 상속한다', () => {
  assert.deepEqual(r('01.26.(월) ~ 02.06.(금)', { year: 2026 }), {
    start: '2026-01-26', end: '2026-02-06',
  });
});

test('전산세무 실측 — 요일 없는 범위와 단일', () => {
  assert.deepEqual(r('01.02 ~ 01.08', { year: 2026 }), { start: '2026-01-02', end: '2026-01-08' });
  assert.deepEqual(r('01.31(토)', { year: 2026 }), { start: '2026-01-31', end: '2026-01-31' });
});

test('끝 항의 월이 생략되면 시작 월을 상속한다', () => {
  assert.deepEqual(r('3.3~9', { year: 2026 }), { start: '2026-03-03', end: '2026-03-09' });
});

test('같은 해 안에서 월을 넘는다', () => {
  assert.deepEqual(r('9.28~10.2', { year: 2026 }), { start: '2026-09-28', end: '2026-10-02' });
});

test('연도가 넘어가면 끝 연도를 +1 한다', () => {
  assert.deepEqual(r('12.28~1.5', { year: 2026 }), { start: '2026-12-28', end: '2027-01-05' });
});

test('requireYear 면 연도 없는 표기를 거부한다', () => {
  const res = tryParseRange('01.26 ~ 02.06', { year: 2026, requireYear: true });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'year-required');
});

test('연도 없고 문맥도 없으면 거부한다', () => {
  assert.equal(r('01.26'), null, '기준 연도가 없으면 날짜를 만들 수 없다');
});

// ---- 만들어내지 않는다 -------------------------------------------------

test('미정 표기에 날짜를 부여하지 않는다', () => {
  for (const t of ['미정', '추후 공지', '별도 공고', '-', '', '·', '없음']) {
    const res = tryParseRange(t, { year: 2026 });
    assert.equal(res.ok, false, `'${t}' 가 통과했다`);
    assert.equal(res.reason, 'tbd', `'${t}' 의 사유가 tbd 가 아니다`);
  }
});

test('존재하지 않는 날짜를 거부한다 — Date 에 맡기면 굴러간다', () => {
  // new Date(2026, 1, 29) 는 3월 1일이 된다
  assert.equal(tryParseRange('2026.02.29').reason, 'invalid-date');
  assert.equal(tryParseRange('2026.13.05').reason, 'invalid-date');
  assert.equal(tryParseRange('2026.00.05').reason, 'invalid-date');
  assert.equal(tryParseRange('2026.05.32').reason, 'invalid-date');
});

test('윤년 2월 29일은 통과한다', () => {
  assert.deepEqual(r('2028.02.29'), { start: '2028-02-29', end: '2028-02-29' });
  assert.deepEqual(r('2024.02.29'), { start: '2024-02-29', end: '2024-02-29' });
  // 평년이면 같은 표기가 거부된다
  assert.equal(r('2026.02.29'), null);
});

test('2020~2099 밖의 연도는 날짜로 보지 않는다', () => {
  // 연도 정규식을 20[2-9]\d 로 좁혀 잡은 결과다. 아무 4자리 숫자를 연도로 읽으면
  // 회차·금액·전화번호가 날짜가 된다. 이 서비스에 2100년대는 범위 밖이다.
  assert.equal(r('2100.02.29'), null);
  assert.equal(r('1999.01.01'), null);
  assert.equal(r('제2026회 시험'), null, '연도처럼 보이는 회차 번호도 걸러야 한다');
});

test('끝이 시작보다 앞이면 거부한다', () => {
  // 월 넘김으로 설명되지 않는 역행
  assert.equal(tryParseRange('2026.05.10 ~ 2026.03.01').reason, 'inconsistent');
});

test('날짜가 없는 문자열은 no-match', () => {
  assert.equal(tryParseRange('접수 방법 안내', { year: 2026 }).reason, 'no-match');
});

test('회차 번호를 날짜로 오인하지 않는다', () => {
  assert.equal(r('제575회', { year: 2026 }), null);
  assert.equal(r('제12회 필기', { year: 2026 }), null);
});

test('절대 throw 하지 않는다', () => {
  for (const t of [null, undefined, '', '~~~', '2026', ':::', '99.99', '<br>']) {
    assert.doesNotThrow(() => tryParseRange(t, { year: 2026 }), `${t} 에서 던졌다`);
  }
});

// ---- 보조 -------------------------------------------------------------

test('제목에서 연도를 뽑는다', () => {
  assert.equal(yearFromHeading('2026년도 리눅스마스터 자격검정 시행일정'), 2026);
  assert.equal(yearFromHeading('2026년도 일정'), 2026);
  assert.equal(yearFromHeading('시행일정'), null);
});

test('isRealDate', () => {
  assert.equal(isRealDate(2026, 2, 28), true);
  assert.equal(isRealDate(2026, 2, 29), false);
  assert.equal(isRealDate(2024, 2, 29), true);
  assert.equal(isRealDate(2000, 2, 29), true);
  assert.equal(isRealDate(2100, 2, 29), false);
});

test('한 셀에 줄바꿈으로 구간이 여럿', () => {
  const got = parseCell('1.26(월)<br>~1.29(목)\n3.13(금)', { year: 2026 });
  // 두 번째 줄이 독립 날짜로 잡힌다
  assert.ok(got.length >= 1);
  assert.equal(got.at(-1).start, '2026-03-13');
});
