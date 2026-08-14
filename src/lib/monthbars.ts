/**
 * 월간 격자 위의 기간 막대 배치. 화면정의 §7.5 · §8.5.
 *
 * 타임라인을 버리고 월간 캘린더를 기본 표현으로 삼으면서 생긴 문제 하나를 푼다:
 * **기간 이벤트를 7열 격자 위에 주 경계를 넘어 이어지는 것처럼 그리는 것.**
 *
 * 이 파일은 도메인을 모른다. `types.ts` 를 import 하지 않는다 — Session 도 Exam 도
 * 여기서는 그냥 `{id, start, end, kind, text}` 다. 그래야 테스트가 픽스처 한 줄로
 * 끝나고, 계산이 화면 코드로 새지 않는다. `.tsx` 는 node --test 가 못 읽으므로
 * JSX 안에 들어간 계산은 영원히 검증되지 않는다.
 *
 * 알고리즘의 핵심 두 가지:
 *
 * 1. **레인은 이벤트의 속성이지 주의 속성이 아니다.** 격자 창 전체의 점유 맵에서
 *    한 번 배정한다. 그러면 주 경계를 넘는 연속성이 후처리가 아니라 알고리즘의
 *    귀결이 된다. 주별로 배정하고 나중에 맞추면 반드시 어긋나는 경우가 생긴다.
 *
 * 2. **과거를 정렬 1차 키로 둔다.** 지난 일정은 숨기지 않고 채도만 낮추므로(§7.5)
 *    입력에 그대로 남아 있다. 이 키가 없으면 1일에 끝난 접수 막대가 20일의 살아
 *    있는 시험 막대를 캡에서 밀어낸다. 밀집한 달에서만 나타나 눈치채기 가장 어렵다.
 */

import type { DayCell, YearMonth } from './calendar.ts';
import { monthGrid } from './calendar.ts';
import { addDays, diffDays } from './dates.ts';

/** 배치의 입력. 도메인 타입이 아니다 */
export interface BarEvent {
  /** 안정 키. 호출부가 만든다 */
  id: string;
  /** YYYY-MM-DD. start <= end 를 호출부가 보장한다 */
  start: string;
  end: string;
  /** 색이 아니라 **모양**을 고른다 (§3.2 색상만으로 구분하지 않는다) */
  kind: 'reg' | 'exam' | 'result';
  /** 막대 안에 쓸 짧은 글 */
  text: string;
}

export interface BarSegment {
  /** React key */
  key: string;
  eventId: string;
  weekIndex: number;
  /** 0=월 … 6=일 */
  colStart: number;
  /** 1..7 */
  span: number;
  /** 0-based. 같은 이벤트는 모든 주에서 같은 값이다 */
  lane: number;
  /** 지난 주에서 이어진다 / 다음 주로 이어진다 */
  continuesLeft: boolean;
  continuesRight: boolean;
  /** 이 세그먼트에 글을 쓰는가. 한 이벤트에 정확히 하나만 true */
  showLabel: boolean;
  kind: BarEvent['kind'];
  text: string;
  /** 원본이 하루짜리인가 */
  isPoint: boolean;
  past: boolean;
  ongoing: boolean;
}

export interface DayOverflow {
  date: string;
  /** `외 N건` 의 N */
  count: number;
  /** 접힌 이벤트 id. 날짜 상세 패널이 이걸로 전부 보여준다 */
  eventIds: string[];
}

export interface WeekLayout {
  weekIndex: number;
  days: DayCell[];
  segments: BarSegment[];
  /**
   * 이 주가 쓰는 레인 수. `grid-template-rows` 에 그대로 들어간다.
   * **주마다 따로 계산한다** — 달 최대치로 주면 붐비는 달에 모든 주가 최악의 주만큼
   * 높아져서 나머지가 화면 밖으로 밀린다.
   */
  laneCount: number;
  /** count > 0 인 날만 */
  overflow: DayOverflow[];
}

export interface MonthLayout {
  month: YearMonth;
  weeks: WeekLayout[];
  /** 격자 창. 앞뒤 달의 딸린 날을 포함한다 */
  window: { from: string; to: string };
  /** 창에 걸렸지만 캡에 밀려 한 칸도 그려지지 않은 이벤트. 날짜순 표에는 남아야 한다 */
  foldedIds: string[];
}

export interface LayoutOptions {
  today: string;
  /** 한 주 최대 레인. 홈 2 · 통합 캘린더 3 · 시험 상세는 제한 없음 */
  laneCap: number;
}

const KIND_RANK: Record<BarEvent['kind'], number> = { reg: 0, exam: 1, result: 2 };

interface Placed {
  event: BarEvent;
  past: boolean;
  ongoing: boolean;
  isPoint: boolean;
  /** 격자 창으로 자른 범위. 레인 배정과 세그먼트는 이것으로 한다 */
  clipStart: string;
  clipEnd: string;
  lane: number;
}

/** [from, to] 의 날짜를 하루씩 */
function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * 배치 순서. 이 순서가 곧 캡에서 살아남는 순서다.
 *
 * 과거 → 시작일 → 긴 것 → 종류 → id. 마지막 id 까지 두어 완전히 결정적으로 만든다.
 * 입력 배열의 순서에 결과가 흔들리면 사전 렌더한 HTML 과 브라우저 렌더가 어긋난다.
 */
function compare(a: Placed, b: Placed): number {
  if (a.past !== b.past) return a.past ? 1 : -1;
  if (a.event.start !== b.event.start) return a.event.start < b.event.start ? -1 : 1;
  const aSpan = diffDays(a.clipEnd, a.clipStart);
  const bSpan = diffDays(b.clipEnd, b.clipStart);
  if (aSpan !== bSpan) return bSpan - aSpan;
  if (a.event.kind !== b.event.kind) return KIND_RANK[a.event.kind] - KIND_RANK[b.event.kind];
  return a.event.id < b.event.id ? -1 : a.event.id > b.event.id ? 1 : 0;
}

export function layoutMonth(month: YearMonth, events: BarEvent[], opt: LayoutOptions): MonthLayout {
  const weeks = monthGrid(month);
  const first = weeks[0]![0]!.date;
  const last = weeks[weeks.length - 1]![6]!.date;

  /**
   * 창에 걸치는 것만 남기되 **자르지 않고 원본 날짜를 들고 간다.**
   * continuesLeft/Right 와 과거 판정이 원본을 봐야 한다.
   */
  const placed: Placed[] = events
    .filter(e => e.end >= first && e.start <= last)
    .map(e => ({
      event: e,
      past: e.end < opt.today,
      ongoing: e.start <= opt.today && opt.today <= e.end,
      isPoint: e.start === e.end,
      clipStart: e.start < first ? first : e.start,
      clipEnd: e.end > last ? last : e.end,
      lane: -1,
    }))
    .sort(compare);

  /**
   * 레인 배정. 창 전체에서 한 번, 최소 빈 레인을 고른다.
   *
   * 캡을 넘는 레인은 아예 시도하지 않는다. 자리를 찾지 못한 이벤트는 **통째로**
   * 접는다 — 주 중간에서 끊기면 왜 거기서 멈췄는지 읽을 수 없다.
   */
  const occupied = new Map<string, Set<number>>();
  const drawn: Placed[] = [];
  const folded: Placed[] = [];
  // 캡이 없어도 이벤트 수를 넘는 레인은 필요 없다
  const maxLane = Number.isFinite(opt.laneCap) ? opt.laneCap : placed.length;

  for (const p of placed) {
    const days = eachDay(p.clipStart, p.clipEnd);
    let lane = -1;
    for (let l = 0; l < maxLane; l++) {
      if (days.every(d => !occupied.get(d)?.has(l))) { lane = l; break; }
    }
    if (lane === -1) { folded.push(p); continue; }
    p.lane = lane;
    for (const d of days) {
      let set = occupied.get(d);
      if (!set) { set = new Set(); occupied.set(d, set); }
      set.add(lane);
    }
    drawn.push(p);
  }

  /**
   * 레인 번호를 조밀하게 다시 매긴다.
   *
   * **달 전체에서 한 번에 한다.** 주마다 따로 매기면 같은 이벤트가 주를 넘을 때
   * 다른 높이로 옮겨 앉아, 이어지는 막대가 계단처럼 보인다. 그 연속성이 이 파일의
   * 존재 이유다.
   */
  const used = [...new Set(drawn.map(p => p.lane))].sort((a, b) => a - b);
  const dense = new Map(used.map((lane, i) => [lane, i]));
  for (const p of drawn) p.lane = dense.get(p.lane)!;

  // 라벨은 이벤트당 한 번. 시작이 창 밖이면 첫 주에 붙는다.
  const labelled = new Set<string>();

  const out: WeekLayout[] = weeks.map((days, weekIndex) => {
    const weekFrom = days[0]!.date;
    const weekTo = days[6]!.date;
    const segments: BarSegment[] = [];

    for (const p of drawn) {
      const segStart = p.clipStart > weekFrom ? p.clipStart : weekFrom;
      const segEnd = p.clipEnd < weekTo ? p.clipEnd : weekTo;
      if (segStart > segEnd) continue;

      const showLabel = !labelled.has(p.event.id);
      if (showLabel) labelled.add(p.event.id);

      segments.push({
        key: `${p.event.id}|w${weekIndex}`,
        eventId: p.event.id,
        weekIndex,
        // 월요일 시작 규약은 dates.ts 의 weekStart 가 소유한다. 여기서 요일을 다시
        // 유도하지 않고 그 주의 첫 칸으로부터 센다.
        colStart: diffDays(segStart, weekFrom),
        span: diffDays(segEnd, segStart) + 1,
        lane: p.lane,
        continuesLeft: p.event.start < weekFrom,
        continuesRight: p.event.end > weekTo,
        showLabel,
        kind: p.event.kind,
        text: p.event.text,
        isPoint: p.isPoint,
        past: p.past,
        ongoing: p.ongoing,
      });
    }

    const overflow: DayOverflow[] = [];
    for (const cell of days) {
      const hidden = folded.filter(p => p.clipStart <= cell.date && cell.date <= p.clipEnd);
      if (hidden.length) {
        overflow.push({ date: cell.date, count: hidden.length, eventIds: hidden.map(p => p.event.id) });
      }
    }

    return {
      weekIndex,
      days,
      segments,
      laneCount: segments.reduce((max, s) => Math.max(max, s.lane + 1), 0),
      overflow,
    };
  });

  return {
    month,
    weeks: out,
    window: { from: first, to: last },
    foldedIds: folded.map(p => p.event.id),
  };
}

/**
 * 기간을 하루로 줄인다. 홈 미리보기(§5.3-E)와 고빈도 그룹(§8.9)에 쓴다.
 *
 * 접수는 **마감일**만 남긴다 — 접수는 시작을 놓쳐서 못 보는 게 아니라 마감을
 * 놓쳐서 못 본다. 기간 시험은 **시작일**만 남긴다. 발표는 버린다 (§5.3-E).
 *
 * `layoutMonth` 의 플래그로 만들지 않았다. 호출부가
 * `layoutMonth(m, summarize(evts), {laneCap: 2})` 로 조합한다 — 작은 함수 둘이
 * 모드 플래그 하나보다 테스트하기 쉽다.
 */
export function summarize(events: BarEvent[]): BarEvent[] {
  const out: BarEvent[] = [];
  for (const e of events) {
    if (e.kind === 'result') continue;
    const at = e.kind === 'reg' ? e.end : e.start;
    out.push({ ...e, start: at, end: at });
  }
  return out;
}
