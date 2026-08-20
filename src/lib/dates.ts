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

/*
 * `toRatio` 가 여기 있었다. 가로 타임라인이 구간을 0~1 비율로 바꿔 쓰던 함수인데
 * 타임라인과 함께 지웠다.
 *
 * 월간 격자는 비율을 쓰지 않는다. `monthbars.ts` 가 정수 열 번호와 span 을 내고
 * CSS 그리드가 그대로 받는다 — 퍼센트 폭은 `minmax(0, 1fr)` 칸 안에서 한 열마다
 * 1px 씩 어긋나 390px 에서 막대와 날짜 숫자가 어긋난다. 소수 기하 헬퍼를 격자
 * 렌더러 옆에 남겨 두면 다시 쓰게 되므로 지운다.
 */

const MD = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', timeZone: 'UTC' });

/** "10월 11일" */
export function monthDay(iso: string): string {
  return MD.format(parse(iso));
}

/** "2026.08.13" */
export function dotted(iso: string): string {
  return iso.replaceAll('-', '.');
}

/** 공식 시각을 24시간제 `HH:mm`으로 정규화한다. */
export function clockLabel(clock: string): string {
  const [hourText, minute = '00'] = clock.split(':');
  const hour = Number(hourText);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !/^\d{2}$/.test(minute)) return clock;
  return `${String(hour).padStart(2, '0')}:${minute}`;
}

/** 캘린더 막대의 접근 가능한 이름에 붙일 공식 시각 문구. */
export function timingSpokenLabel(timing?: import('../types.ts').EventTiming): string | null {
  if (!timing) return null;
  if (timing.status === 'varies') return timing.note ?? '시험장별 시간 상이';
  if (timing.status === 'select-on-booking') return timing.note ?? '접수할 때 시간 선택';
  if (!timing.start) return timing.note ?? null;
  const start = clockLabel(timing.start);
  return timing.end ? `${start}부터 ${clockLabel(timing.end)}까지` : start;
}

/**
 * 날짜 하나 또는 기간을 화면 문구로. 화면정의 §16.2.
 *
 * 뒤쪽에서 연도를 반복하지 않는다 — `2026.09.21 ~ 2026.10.19` 는 같은 정보를 두 번
 * 읽게 하고, 목록에서는 그 폭 때문에 시험명이 밀린다.
 *
 * `spoken` 은 스크린리더용이다. `09.21 ~ 10.19` 를 그대로 읽으면 "영구점이일" 처럼
 * 나와 날짜로 들리지 않는다.
 */
export function rangeLabel(start: string, end: string, style: 'full' | 'short' | 'spoken' = 'full'): string {
  if (style === 'spoken') {
    return start === end ? monthDay(start) : `${monthDay(start)}부터 ${monthDay(end)}까지`;
  }
  const head = style === 'short' ? dotted(start).slice(5) : dotted(start);
  if (start === end) return head;
  // 연도가 같으면 뒤에서 생략한다. 해를 넘기는 기간은 전부 적어야 뜻이 통한다.
  const tail = start.slice(0, 4) === end.slice(0, 4) ? dotted(end).slice(5) : dotted(end);
  return `${head} ~ ${tail}`;
}
