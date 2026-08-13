/**
 * 월간 격자 계산. 라이브러리 없이 한다.
 *
 * 월 길이·윤년·주 시작은 날짜 코드에서 버그가 숨는 대표적인 자리라 테스트를 붙였다.
 * 주 시작은 **월요일**이다 — `dates.ts` 의 ISO 주 결정과 맞춘다. 시험이 대부분 주말에
 * 치러지므로 토·일이 한 주의 끝에 나란히 붙어 있는 편이 읽기 좋다.
 */

import { addDays, parse, weekStart } from './dates.ts';

export const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const;

export interface DayCell {
  /** YYYY-MM-DD */
  date: string;
  /** 이 격자가 그리는 달에 속하는가. 앞뒤로 딸려온 날은 false */
  inMonth: boolean;
  day: number;
  /** 0=월 … 6=일 */
  weekday: number;
}

/** 'YYYY-MM' */
export type YearMonth = string;

export function ym(iso: string): YearMonth {
  return iso.slice(0, 7);
}

export function monthLabel(m: YearMonth): string {
  const [y, mm] = m.split('-');
  return `${y}년 ${Number(mm)}월`;
}

/** 그 달의 1일 */
export function firstOfMonth(m: YearMonth): string {
  return `${m}-01`;
}

/** 그 달의 마지막 날. 다음 달 1일에서 하루 빼는 방식이라 월 길이·윤년을 따로 다루지 않는다. */
export function lastOfMonth(m: YearMonth): string {
  const [y, mm] = m.split('-').map(Number);
  const nextY = mm === 12 ? y! + 1 : y!;
  const nextM = mm === 12 ? 1 : mm! + 1;
  return addDays(`${nextY}-${String(nextM).padStart(2, '0')}-01`, -1);
}

/**
 * 한 달을 주 단위 격자로. 앞뒤 빈칸은 인접 달의 날짜로 채우고 `inMonth: false` 로 표시한다.
 * 빈칸을 null 로 두지 않는 이유는, 그 자리에도 날짜가 있어야 사용자가 주의 연속성을 읽기 때문이다.
 */
export function monthGrid(m: YearMonth): DayCell[][] {
  const start = weekStart(firstOfMonth(m));
  const end = lastOfMonth(m);

  const weeks: DayCell[][] = [];
  // cursor 는 각 주의 월요일이다. 마지막 날이 든 주의 월요일은 반드시 end 이하이므로
  // 이 조건만으로 정확히 그 주까지 포함되고 종료된다.
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 7)) {
    const week: DayCell[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(cursor, i);
      week.push({ date, inMonth: ym(date) === m, day: parse(date).getUTCDate(), weekday: i });
    }
    weeks.push(week);
  }
  return weeks;
}

/** from 이 속한 달부터 to 가 속한 달까지. 최대 max 개월. */
export function monthsBetween(from: string, to: string, max = 12): YearMonth[] {
  const out: YearMonth[] = [];
  let cursor = firstOfMonth(ym(from));
  const last = ym(to);
  while (out.length < max) {
    const m = ym(cursor);
    out.push(m);
    if (m >= last) break;
    // 1일에서 32일을 더하면 반드시 다음 달로 넘어간다. 그 달의 1일로 되돌린다.
    cursor = firstOfMonth(ym(addDays(cursor, 32)));
  }
  return out;
}

/** 날짜 → 그 날에 걸린 것들. 캘린더가 칸마다 조회하므로 미리 묶어 둔다. */
export function groupByDate<T extends { date: string }>(items: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const it of items) {
    const list = out.get(it.date);
    if (list) list.push(it);
    else out.set(it.date, [it]);
  }
  return out;
}

/** 오늘 이후에 남은 항목이 없으면 캘린더를 그릴 이유가 없다 */
export function calendarRange(dates: string[], from: string): { from: YearMonth; to: YearMonth } | null {
  const future = dates.filter(d => d >= from).sort();
  if (!future.length) return null;
  return { from: ym(from), to: ym(future.at(-1)!) };
}

