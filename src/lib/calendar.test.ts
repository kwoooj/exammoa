// node --test src/lib/calendar.test.ts
//
// 월 길이·윤년·주 시작은 날짜 코드에서 버그가 숨는 자리다. 라이브러리를 안 쓰기로 했으니
// 그만큼 여기서 확인한다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calendarRange, firstOfMonth, groupByDate, lastOfMonth, monthGrid, monthLabel, monthsBetween, ym,
} from './calendar.ts';

test('ym 은 YYYY-MM 을 뽑는다', () => {
  assert.equal(ym('2026-08-13'), '2026-08');
});

test('monthLabel 은 0 을 떼고 읽는다', () => {
  assert.equal(monthLabel('2026-08'), '2026년 8월');
  assert.equal(monthLabel('2026-12'), '2026년 12월');
});

// ---- 달의 경계 ---------------------------------------------------------

test('달의 첫날과 마지막 날', () => {
  assert.equal(firstOfMonth('2026-08'), '2026-08-01');
  assert.equal(lastOfMonth('2026-08'), '2026-08-31');
  assert.equal(lastOfMonth('2026-09'), '2026-09-30');
});

test('12월 다음은 이듬해 1월이다', () => {
  assert.equal(lastOfMonth('2026-12'), '2026-12-31');
});

test('평년 2월은 28일', () => {
  assert.equal(lastOfMonth('2026-02'), '2026-02-28');
});

test('윤년 2월은 29일', () => {
  assert.equal(lastOfMonth('2028-02'), '2028-02-29');
  assert.equal(lastOfMonth('2024-02'), '2024-02-29');
});

test('100 으로 나뉘지만 400 으로 안 나뉘는 해는 윤년이 아니다', () => {
  assert.equal(lastOfMonth('2100-02'), '2100-02-28');
  assert.equal(lastOfMonth('2000-02'), '2000-02-29');
});

// ---- 격자 -------------------------------------------------------------

test('격자는 월요일에서 시작한다', () => {
  // 2026-08-01 은 토요일. 그 주 월요일은 07-27
  const weeks = monthGrid('2026-08');
  assert.equal(weeks[0]![0]!.date, '2026-07-27');
  assert.equal(weeks[0]![0]!.weekday, 0);
});

test('각 주는 7칸이다', () => {
  for (const m of ['2026-01', '2026-02', '2026-08', '2028-02']) {
    for (const week of monthGrid(m)) assert.equal(week.length, 7, `${m} 의 한 주가 7칸이 아니다`);
  }
});

test('그 달의 모든 날이 정확히 한 번 들어간다', () => {
  const cells = monthGrid('2026-08').flat().filter(c => c.inMonth);
  assert.equal(cells.length, 31);
  assert.equal(cells[0]!.date, '2026-08-01');
  assert.equal(cells.at(-1)!.date, '2026-08-31');
  assert.equal(new Set(cells.map(c => c.date)).size, 31, '중복된 날이 있다');
});

test('앞뒤로 딸려온 날은 inMonth 가 false 다', () => {
  const weeks = monthGrid('2026-08');
  assert.equal(weeks[0]![0]!.inMonth, false); // 07-27
  assert.equal(weeks[0]![5]!.date, '2026-08-01');
  assert.equal(weeks[0]![5]!.inMonth, true);
});

test('마지막 날이 든 주까지 그리고 멈춘다', () => {
  const weeks = monthGrid('2026-08');
  assert.ok(weeks.flat().some(c => c.date === '2026-08-31'));
  // 8월 31일은 월요일이라 마지막 주가 새로 열린다
  assert.equal(weeks.at(-1)![0]!.date, '2026-08-31');
  assert.equal(weeks.length, 6);
});

test('1일이 월요일인 달은 앞에 빈칸이 없다', () => {
  // 2026-06-01 은 월요일
  const weeks = monthGrid('2026-06');
  assert.equal(weeks[0]![0]!.date, '2026-06-01');
  assert.equal(weeks[0]![0]!.inMonth, true);
});

test('1일이 일요일인 달은 앞에 6칸이 딸려온다', () => {
  // 2026-02-01 은 일요일
  const weeks = monthGrid('2026-02');
  assert.equal(weeks[0]![6]!.date, '2026-02-01');
  assert.equal(weeks[0]!.filter(c => !c.inMonth).length, 6);
});

test('어떤 달도 6주를 넘지 않는다', () => {
  for (const y of [2024, 2026, 2028]) {
    for (let m = 1; m <= 12; m++) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      const n = monthGrid(key).length;
      assert.ok(n >= 4 && n <= 6, `${key} 가 ${n}주다`);
    }
  }
});

test('day 는 그 달의 날짜 숫자다', () => {
  const weeks = monthGrid('2026-08');
  const first = weeks.flat().find(c => c.date === '2026-08-01')!;
  assert.equal(first.day, 1);
});

// ---- 달 범위 ----------------------------------------------------------

test('시작과 끝이 같은 달이면 하나만', () => {
  assert.deepEqual(monthsBetween('2026-08-13', '2026-08-31'), ['2026-08']);
});

test('연말을 넘어간다', () => {
  assert.deepEqual(monthsBetween('2026-11-20', '2027-02-01'), ['2026-11', '2026-12', '2027-01', '2027-02']);
});

test('31일에서 시작해도 달을 건너뛰지 않는다', () => {
  // 1일 + 32일 방식이라 31일 시작이 2월을 건너뛰는 일이 없어야 한다
  assert.deepEqual(monthsBetween('2026-01-31', '2026-04-01'), ['2026-01', '2026-02', '2026-03', '2026-04']);
});

test('max 로 자른다', () => {
  assert.equal(monthsBetween('2026-01-01', '2030-01-01', 3).length, 3);
});

test('끝이 시작보다 앞이면 시작 달만', () => {
  assert.deepEqual(monthsBetween('2026-08-13', '2026-01-01'), ['2026-08']);
});

// ---- 묶기·범위 --------------------------------------------------------

test('같은 날짜를 묶는다', () => {
  const g = groupByDate([
    { date: '2026-08-20', v: 1 },
    { date: '2026-08-20', v: 2 },
    { date: '2026-09-01', v: 3 },
  ]);
  assert.equal(g.get('2026-08-20')!.length, 2);
  assert.equal(g.get('2026-09-01')!.length, 1);
  assert.equal(g.get('2026-10-01'), undefined);
});

test('남은 일정이 없으면 캘린더를 그리지 않는다', () => {
  assert.equal(calendarRange(['2026-01-01'], '2026-08-13'), null);
  assert.equal(calendarRange([], '2026-08-13'), null);
});

test('오늘 달부터 마지막 일정 달까지', () => {
  assert.deepEqual(calendarRange(['2026-11-02', '2026-08-20'], '2026-08-13'), {
    from: '2026-08',
    to: '2026-11',
  });
});

test('오늘 것은 포함한다', () => {
  assert.deepEqual(calendarRange(['2026-08-13'], '2026-08-13'), { from: '2026-08', to: '2026-08' });
});
