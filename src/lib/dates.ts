/** 날짜 유틸. 모든 날짜는 'YYYY-MM-DD' 문자열이고, 시간대 문제를 피하려 UTC 정오로 파싱한다. */

export function parse(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) {
    throw new TypeError(`날짜 형식이 아닙니다: ${JSON.stringify(iso)}`);
  }
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function format(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function today(): string {
  return format(new Date());
}

export function addDays(iso: string, days: number): string {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return format(d);
}

export function addMonths(iso: string, months: number): string {
  const d = parse(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return format(d);
}

/** a - b, 일 단위 */
export function diffDays(a: string, b: string): number {
  return Math.round((parse(a).getTime() - parse(b).getTime()) / 86400000);
}

/** 오늘 기준 D-day. 미래는 양수 */
export function dDay(iso: string, from = today()): number {
  return diffDays(iso, from);
}

/**
 * ISO 주의 월요일. 시험이 대부분 주말에 치러지므로 일요일 시작으로 잡으면
 * "시험 전주"가 잘못 계산된다. 반드시 월요일 시작.
 */
export function weekStart(iso: string): string {
  const d = parse(iso);
  const dow = d.getUTCDay(); // 0=일
  const back = dow === 0 ? 6 : dow - 1;
  return addDays(iso, -back);
}

export function sameWeek(a: string, b: string): boolean {
  return weekStart(a) === weekStart(b);
}

/** 두 구간이 하루라도 겹치는가 (양끝 포함) */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/** 구간 [start, end] 를 [from, to] 범위 안의 0~1 위치로. 타임라인 좌표 계산용 */
export function toRatio(start: string, end: string, from: string, to: string) {
  const total = diffDays(to, from);
  if (total <= 0) return { left: 0, width: 0 };
  const left = diffDays(start, from) / total;
  const width = (diffDays(end, start) + 1) / total;
  return { left, width };
}

const MD = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', timeZone: 'UTC' });

/** "10월 11일" */
export function monthDay(iso: string): string {
  return MD.format(parse(iso));
}

/** "2026.08.13" */
export function dotted(iso: string): string {
  return iso.replaceAll('-', '.');
}
