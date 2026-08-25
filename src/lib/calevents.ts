/**
 * 회차·이벤트를 캘린더가 쓸 형태로. 화면정의 §8.5 · §8.8 · §8.9 · §8.10.
 *
 * `monthbars.ts` 가 기하를 맡고 여기가 도메인을 맡는다. 경계를 지키는 이유는
 * 저쪽을 픽스처 한 줄로 테스트하기 위해서다.
 *
 * **중복 제거는 sessions 를 순회해서 얻는다. exams 를 순회하지 않는다.**
 * 일정의 주체는 종목이 아니라 시행그룹이라, 종목별로 돌면 같은 막대가 반복된다
 * (실측: 29종목의 일정이 이벤트 단위로 완전히 동일하다). 막대 id 에 slug 를 넣지
 * 않으므로 중복이 구조적으로 불가능하다. 접힌 종목은 막대의 **속성**(`examSlugs`)이
 * 되고, 상세 패널이 전부 나열해서 선택이 사라진 게 아님을 보인다.
 *
 * **상시시험과 미공고를 절대 한 통에 담지 않는다.** 둘 다 `events` 가 비어 있어
 * 뭉뚱그리기 쉽지만 뜻이 정반대다 — 상시는 아무 때나 볼 수 있는 것이고 미공고는
 * 아직 못 보는 것이다. 각각 `ruleCards` 와 `tbdNotices` 로 나간다.
 *
 * 상시시험의 진짜 버그는 "튀어나온 막대" 가 아니다. `events` 가 비어 있어 순진한
 * 구현은 **우연히** 막대를 안 그린다. 나올 버그는 **없는 규칙 카드** 다 — 컴활을
 * 검색했더니 아무 설명 없는 빈 달력이 나온다.
 */

import type { EventKind, EventTiming, Exam, LinksFile, ScheduleGroup, Session } from '../types.ts';
import type { BarEvent } from './monthbars.ts';
import { summarize } from './monthbars.ts';
import { rangeLabel, timingSpokenLabel } from './dates.ts';
import { applyLink, officialLink } from './links.ts';

export interface CalendarEvent extends BarEvent {
  groupId: string;
  sessionId: string;
  phase: 'written' | 'practical' | 'single';
  /** 같은 kind 안의 순번. 1 정기접수, 2 이상 추가·빈자리·취소좌석 */
  seq: number;
  start: string;
  end: string;
  /** 이 막대가 대표하는 종목 전부 (§8.8) */
  examSlugs: string[];
  /** `정보처리기사` 또는 `정보처리기사 외 3개` */
  displayName: string;
  /** 막대에 쓸 짧은 이름 */
  shortName: string;
  /** `국가기술자격 기사 (2026년도 제3회)` */
  sessionLabel: string;
  agency: string;
  /** 원본 이벤트 문구. `실기 원서접수` · `취소좌석 접수` */
  eventLabel: string;
  /** 표의 구분 열. `실기 접수` · `시험` · `실기 추가접수` */
  kindLabel: string;
  note: string | null;
  timing?: EventTiming;
  applyUrl?: string;
  /**
   * 접수 링크에 쓸 문구. 종목별 접수 페이지면 `원서접수`, 기관의 일반 안내면
   * `원서접수 안내` 다.
   *
   * URL 만 들고 다니면 화면이 전부 "원서접수" 라고 적는다. 실제로 그렇게 나왔고,
   * 일반 안내 페이지로 보내면서 접수창을 열어 줄 것처럼 읽혔다 (§16).
   */
  applyLabel?: string;
  agencyUrl?: string;
}

/** 상시시험. 막대 대신 규칙 카드를 낸다 (§7.7) */
export interface RuleCard {
  groupId: string;
  name: string;
  agency: string;
  examSlugs: string[];
  rule: string | null;
  /** 사람이 규칙을 마지막으로 확인한 날 */
  ruleCheckedAt?: string;
  applyUrl?: string;
  applyLabel?: string;
  agencyUrl?: string;
}

/** 일정 미공고 (§7.8). 규칙 카드와 합치지 않는다 */
export interface TbdNotice {
  groupId: string;
  name: string;
  agency: string;
  examSlugs: string[];
  agencyUrl?: string;
  pendingImport: boolean;
}

export interface CalendarData {
  events: CalendarEvent[];
  ruleCards: RuleCard[];
  tbdNotices: TbdNotice[];
  /** 고빈도라 기간을 접은 그룹. "전체 날짜는 아래 일정표에서" 안내에 쓴다 */
  summarizedGroupIds: string[];
}

export interface CalendarInput {
  sessions: Session[];
  groups: ScheduleGroup[];
  exams: Exam[];
  /** 관심 시험 보기에서 사용할 종목. 비어 있으면 전체 일정 모드 (§8.3) */
  selectedSlugs?: string[];
  /** 접수·시험·발표 필터. 비어 있거나 없으면 전부 */
  kinds?: EventKind[];
  /** 이 구간에 걸치는 것만. 없으면 전부 */
  window?: { from: string; to: string };
  /**
   * 공식 링크 조립 규칙. 주면 막대·상세 패널·날짜순 표의 링크가 종목코드 폴백까지
   * 태운다. 안 주면 그룹에 박힌 주소만 쓴다.
   *
   * 이게 없으면 상세 패널이 한국산업인력공단 47종목에 대해 링크를 못 낸다 —
   * 그 그룹에는 agencyUrl 이 없고 Q-Net 상세는 jmCd 로 조립해야 나오기 때문이다.
   */
  links?: LinksFile;
  jmCds?: ReadonlySet<string>;
}

const KIND_TEXT: Record<EventKind, string> = { reg: '접수', exam: '시험', result: '발표' };
const PHASE_TEXT: Record<CalendarEvent['phase'], string> = { written: '필기', practical: '실기', single: '' };

/**
 * 표의 구분 열 문구.
 *
 * `seq >= 2` 를 '추가접수' 로 갈라 적는다. 원본 label 이 '빈자리접수'·'취소좌석 접수'
 * 로 제각각인데, 그것을 '원서접수' 로 뭉치면 사용자가 이미 지난 정기접수로 읽고
 * 남은 기회를 놓친다 (§7.5 정기접수·추가접수를 분리해 표시한다).
 */
function kindLabelOf(kind: EventKind, phase: CalendarEvent['phase'], seq: number): string {
  const p = PHASE_TEXT[phase];
  const k = kind === 'reg' && seq >= 2 ? '추가접수' : KIND_TEXT[kind];
  return p ? `${p} ${k}` : k;
}

/** `정보처리기사` · `정보처리기사 외 3개` (§8.8) */
function displayNameOf(names: string[]): string {
  const first = names[0] ?? '';
  return names.length > 1 ? `${first} 외 ${names.length - 1}개` : first;
}

export function buildCalendarData(input: CalendarInput): CalendarData {
  const { sessions, groups, exams } = input;
  const selected = input.selectedSlugs ?? [];
  const kinds = input.kinds?.length ? new Set(input.kinds) : null;
  const win = input.window;

  const groupById = new Map(groups.map(g => [g.id, g]));
  const examBySlug = new Map(exams.map(e => [e.slug, e]));

  /**
   * 어느 그룹의 어느 종목을 보여줄 것인가.
   *
   * 선택이 없으면 전체 일정 모드다 — 그룹이 선언한 종목을 그대로 쓴다.
   * 선택이 있으면 **선택한 것만** 담는다. 그래야 상세 패널의 종목 수와 사용자가
   * 고른 수가 어긋나지 않는다.
   */
  const slugsByGroup = new Map<string, string[]>();
  if (selected.length === 0) {
    for (const g of groups) {
      const known = g.examSlugs.filter(s => examBySlug.has(s));
      if (known.length) slugsByGroup.set(g.id, known);
    }
  } else {
    for (const slug of selected) {
      const exam = examBySlug.get(slug);
      if (!exam) continue;
      const list = slugsByGroup.get(exam.groupId) ?? [];
      if (!list.includes(slug)) list.push(slug);
      slugsByGroup.set(exam.groupId, list);
    }
  }

  const events: CalendarEvent[] = [];
  const ruleCards: RuleCard[] = [];
  const tbdNotices: TbdNotice[] = [];
  const summarizedGroupIds: string[] = [];

  for (const [groupId, slugs] of slugsByGroup) {
    const group = groupById.get(groupId);
    const groupSessions = sessions.filter(s => s.groupId === groupId);
    const names = slugs.map(s => examBySlug.get(s)?.name ?? s);
    const shortName = (() => {
      const first = examBySlug.get(slugs[0] ?? '');
      const base = first?.short ?? first?.name ?? slugs[0] ?? '';
      return slugs.length > 1 ? `${base} 외 ${slugs.length - 1}` : base;
    })();
    const firstExam = examBySlug.get(slugs[0] ?? '');
    const agency = firstExam?.agency ?? group?.agency ?? '';

    /**
     * 이 그룹의 공식 주소. 접힌 막대는 종목이 여럿이지만 일정의 주체가 그룹이므로
     * 대표 종목으로 조립한다 — 그룹 일정 하나에 접수처가 여럿일 수는 없다.
     */
    const resolved = (() => {
      if (input.links && input.jmCds && firstExam) {
        const a = applyLink(firstExam, group, input.links, input.jmCds);
        const o = officialLink(firstExam, group, input.links, input.jmCds);
        return {
          apply: a.href ?? undefined,
          applyLabel: a.href ? a.label : undefined,
          official: o.href ?? undefined,
        };
      }
      return {
        apply: group?.applyUrl,
        applyLabel: group?.applyUrl ? '원서접수' : undefined,
        official: group?.agencyUrl,
      };
    })();

    // 상시시험. 막대를 만들지 않고 규칙 카드만 낸다.
    const rolling = group?.cadence === 'rolling'
      || (groupSessions.length > 0 && groupSessions.every(s => s.mode === 'rolling'))
      || slugs.every(s => examBySlug.get(s)?.rolling === true);
    if (rolling) {
      ruleCards.push({
        groupId, name: group?.name ?? displayNameOf(names), agency, examSlugs: slugs,
        rule: group?.rollingRule ?? examBySlug.get(slugs[0] ?? '')?.rollingRule ?? null,
        ...(group?.ruleCheckedAt ? { ruleCheckedAt: group.ruleCheckedAt } : {}),
        ...(resolved.apply ? { applyUrl: resolved.apply, applyLabel: resolved.applyLabel } : {}),
        ...(resolved.official ? { agencyUrl: resolved.official } : {}),
      });
      continue;
    }

    /**
     * 고빈도 그룹은 기간을 펼치지 않는다 (§8.9).
     * 실측: 2026-10 한 달에 toeic-speaking 36건 · daily-alt 24건 · daily-main 22건이
     * 몰려 한 칸을 통째로 채운다. 전체 날짜는 날짜순 일정표에서 볼 수 있다.
     */
    const collapse = group?.cadence === 'frequent';
    if (collapse) summarizedGroupIds.push(groupId);

    for (const session of groupSessions) {
      if (session.mode === 'rolling' || session.status === 'tbd') continue;

      const made: CalendarEvent[] = [];
      for (const e of session.events) {
        if (kinds && !kinds.has(e.kind)) continue;
        made.push({
          // slug 가 id 에 없다. 중복이 구조적으로 불가능한 이유다.
          id: `${session.id}|${e.kind}|${e.phase}|${e.seq}`,
          start: e.start,
          end: e.end,
          kind: e.kind,
          text: '',
          groupId,
          sessionId: session.id,
          phase: e.phase,
          seq: e.seq,
          examSlugs: slugs,
          displayName: displayNameOf(names),
          shortName,
          sessionLabel: session.label ?? group?.name ?? '',
          agency,
          eventLabel: e.label,
          kindLabel: kindLabelOf(e.kind, e.phase, e.seq),
          note: e.note,
          ...(e.timing ? { timing: e.timing } : {}),
          ...(resolved.apply ? { applyUrl: resolved.apply, applyLabel: resolved.applyLabel } : {}),
          ...(resolved.official ? { agencyUrl: resolved.official } : {}),
        });
      }

      // 요약은 날짜만 줄인다. 나머지 필드는 그대로 유지된다.
      const shaped = collapse
        ? summarize(made).map((b, i) => {
          const original = made[i]!;
          if (original.start !== original.end && b.start === b.end) {
            // 고빈도 접수는 마감일 점 하나로 줄인다. 원래 시작 시각을 마감일에
            // 붙이면 거짓 정보가 되므로 공식 마감 시각만 새 점의 시작 시각으로 쓴다.
            const { timing, ...withoutTiming } = original;
            const deadline = timing?.end;
            return {
              ...withoutTiming,
              start: b.start,
              end: b.end,
              ...(deadline ? {
                timing: {
                  start: deadline,
                  timezone: timing.timezone,
                  status: timing.status,
                  ...(timing.note ? { note: timing.note } : {}),
                },
              } : {}),
            };
          }
          return { ...original, start: b.start, end: b.end };
        }).filter((_, i) => made[i]!.kind !== 'result')
        : made;

      for (const ce of shaped) {
        if (win && (ce.end < win.from || ce.start > win.to)) continue;
        // §8.5 — 막대 안에는 시험 약칭과 이벤트 종류를 함께 표시한다
        events.push({ ...ce, text: `${ce.shortName} ${ce.kindLabel}` });
      }
    }

    /**
     * 이벤트를 하나도 못 만든 그룹은 미공고다.
     * 필터·창 때문에 비었을 수도 있으므로 필터 이전의 회차 유무로 판단한다.
     */
    const hasSchedule = groupSessions.some(
      s => s.mode !== 'rolling' && s.status !== 'tbd' && s.events.length > 0,
    );
    if (!hasSchedule) {
      tbdNotices.push({
        groupId, name: group?.name ?? displayNameOf(names), agency, examSlugs: slugs,
        pendingImport: groupSessions.some(session => session.scheduleState === 'import-pending'),
        // 일정이 없을수록 링크가 중요하다. 여기서 빠지면 막다른 길이 된다.
        ...(resolved.official ? { agencyUrl: resolved.official } : {}),
      });
    }
  }

  events.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.id < b.id ? -1 : 1));
  return { events, ruleCards, tbdNotices, summarizedGroupIds };
}

// ---- 접근성 (§8.10 · §14) ---------------------------------------------

export type EventState = 'past' | 'ongoing' | 'today' | 'upcoming';

export function stateOf(event: { start: string; end: string }, today: string): EventState {
  if (event.end < today) return 'past';
  if (event.start > today) return 'upcoming';
  return event.start === event.end && event.start === today ? 'today' : 'ongoing';
}

const STATE_TEXT: Record<EventState, string> = {
  past: '종료', ongoing: '진행 중', today: '오늘', upcoming: '예정',
};

export interface TableRow {
  eventId: string;
  /** `09.21 ~ 10.19` 또는 `09.12` */
  dateLabel: string;
  /** 기계 판독용. 기간이면 두 개 */
  dateTimes: string[];
  start: string;
  end: string;
  timing?: EventTiming;
  examName: string;
  examSlugs: string[];
  kindLabel: string;
  stateLabel: string;
  applyLabel?: string;
  state: EventState;
  applyUrl?: string;
  agencyUrl?: string;
}

/**
 * 캘린더 아래 날짜순 표 (§8.10).
 *
 * **격자에 넘긴 바로 그 배열을 받는다.** 회차를 다시 뒤져 만들면 두 경로가 조용히
 * 어긋나고, `외 N건` 으로 접힌 일정이 표에서도 빠져서 "동일한 공식 일정" 이라는
 * 약속이 거짓이 된다. 접힌 것이야말로 표에 반드시 있어야 하는 것이다.
 */
export function scheduleTable(events: CalendarEvent[], today: string): TableRow[] {
  return [...events]
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.id < b.id ? -1 : 1))
    .map(e => {
      const state = stateOf(e, today);
      return {
        eventId: e.id,
        dateLabel: rangeLabel(e.start, e.end, 'short'),
        dateTimes: e.start === e.end ? [e.start] : [e.start, e.end],
        start: e.start,
        end: e.end,
        ...(e.timing ? { timing: e.timing } : {}),
        examName: e.displayName,
        examSlugs: e.examSlugs,
        kindLabel: e.kindLabel,
        stateLabel: STATE_TEXT[state],
        state,
        ...(e.applyUrl ? { applyUrl: e.applyUrl, applyLabel: e.applyLabel ?? '원서접수' } : {}),
        ...(e.agencyUrl ? { agencyUrl: e.agencyUrl } : {}),
      };
    });
}

/**
 * 막대의 접근성 이름. §14 — 색과 모양으로만 말하지 않는다.
 *
 * 표의 상태 열과 같은 `stateOf` 를 쓴다. 두 곳이 다른 말을 하면 화면을 보는 사람과
 * 듣는 사람이 다른 정보를 얻는다.
 */
export function barAriaLabel(event: CalendarEvent, today: string): string {
  return [
    event.displayName,
    event.kindLabel,
    rangeLabel(event.start, event.end, 'spoken'),
    timingSpokenLabel(event.timing),
    STATE_TEXT[stateOf(event, today)],
  ].filter(Boolean).join(', ');
}
