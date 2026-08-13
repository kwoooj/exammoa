/**
 * 가로 타임라인 좌표 계산.
 *
 * 달력과 역할이 다르다. 달력은 '특정 날짜에 뭐가 있나' 를, 타임라인은 '6개월 중 어디가
 * 몰려 있나' 를 본다. 그래서 둘 다 둔다.
 *
 * 세로축은 **시행그룹**이다. 실측상 47종목의 일정이 7가지뿐이라 종목별로 행을 만들면
 * 같은 막대가 29줄 반복된다.
 */

import type { EventKind, ExamPlan, ScheduleGroup, Session } from '../types.ts';
import { addMonths, diffDays } from './dates.ts';
import { monthsBetween, firstOfMonth, monthLabel } from './calendar.ts';
import { resolvePlans } from './plan.ts';

/** 한 화면에 담는 기간. 6개월을 넘기면 막대가 뭉개진다 */
export const WINDOW_MONTHS = 6;

export interface Window {
  from: string;
  to: string;
}

export function timelineWindow(today: string, months = WINDOW_MONTHS): Window {
  return { from: today, to: addMonths(today, months) };
}

/**
 * 구간을 창에 맞춰 자른다. 창을 벗어난 이벤트를 그대로 그리면 막대가 화면 밖으로 나간다.
 * 창과 전혀 겹치지 않으면 null.
 */
export function clip(start: string, end: string, w: Window): { left: number; width: number } | null {
  if (end < w.from || start > w.to) return null;
  const total = diffDays(w.to, w.from);
  if (total <= 0) return null;

  const s = start < w.from ? w.from : start;
  const e = end > w.to ? w.to : end;
  const left = diffDays(s, w.from) / total;
  // 하루짜리도 보이도록 최소 폭을 준다
  const width = Math.max((diffDays(e, s) + 1) / total, 1 / total);
  return { left, width: Math.min(width, 1 - left) };
}

/** 창 안의 월 경계 위치. 축에 세로선과 라벨을 놓는 데 쓴다 */
export function monthTicks(w: Window): { month: string; label: string; left: number }[] {
  const total = diffDays(w.to, w.from);
  if (total <= 0) return [];
  return monthsBetween(w.from, w.to, WINDOW_MONTHS + 2)
    .map(m => {
      const at = firstOfMonth(m);
      return { month: m, label: monthLabel(m).replace(/^\d+년 /, ''), left: diffDays(at, w.from) / total };
    })
    // 첫 달 1일은 창 시작보다 앞이라 음수가 된다. 그건 라벨만 쓰고 선은 그리지 않는다.
    .filter(t => t.left < 1);
}

export interface Bar {
  key: string;
  kind: EventKind;
  left: number;
  width: number;
  label: string;
  /** 하루짜리 — 막대가 아니라 점으로 그린다 */
  isPoint: boolean;
  /** 이미 지난 이벤트 */
  past: boolean;
  /** 사용자가 이 단계의 응시일을 지정했다. 원래 기간 막대를 흐리게 한다 */
  superseded: boolean;
}

export interface Marker {
  key: string;
  left: number;
  label: string;
}

export interface Row {
  groupId: string;
  /** 사용자가 고른 종목 이름. 같은 그룹에서 여럿 골랐으면 `정보처리기사 +2` */
  label: string;
  examSlugs: string[];
  agency: string;
  /** 이벤트가 너무 많아 개별 막대 대신 밴드로 그린다 */
  dense: boolean;
  eventCount: number;
  sessionCount: number;
  bars: Bar[];
  markers: Marker[];
}

/** 이 수를 넘으면 개별 막대가 뭉개진다. 지게차운전기능사는 6개월에 76개가 들어온다. */
export const DENSE_THRESHOLD = 14;

export function buildRows(
  plans: ExamPlan[],
  sessions: Session[],
  groups: ScheduleGroup[],
  nameOf: (slug: string) => string,
  w: Window,
): Row[] {
  const groupById = new Map(groups.map(g => [g.id, g]));
  const resolved = resolvePlans(plans, sessions);

  // 그룹별로 사용자가 고른 종목을 모은다
  const byGroup = new Map<string, string[]>();
  for (const p of plans) {
    const list = byGroup.get(p.groupId);
    if (list) { if (!list.includes(p.examSlug)) list.push(p.examSlug); }
    else byGroup.set(p.groupId, [p.examSlug]);
  }

  const rows: Row[] = [];

  for (const [groupId, slugs] of byGroup) {
    const group = groupById.get(groupId);
    // 상시시험은 확정 일정이 없어 그릴 막대가 없다. 규칙 카드로 처리한다.
    if (group?.cadence === 'rolling') continue;

    const inWindow = sessions.filter(
      s => s.groupId === groupId && s.mode !== 'rolling' && s.status !== 'tbd'
        && s.events.some(e => e.end >= w.from && e.start <= w.to),
    );

    const events = inWindow.flatMap(s => s.events.map(e => ({ session: s, e })));
    const visible = events.filter(({ e }) => e.end >= w.from && e.start <= w.to);

    // 이 그룹에서 사용자가 지정한 응시일
    const picked = resolved.filter(r => r.plan.groupId === groupId && r.examDate);
    const supersededPhases = new Set(picked.map(r => `${r.plan.sessionId}|${r.plan.phase}`));

    const dense = visible.length > DENSE_THRESHOLD;

    const bars: Bar[] = dense ? [] : visible.flatMap(({ session, e }) => {
      const c = clip(e.start, e.end, w);
      if (!c) return [];
      return [{
        key: `${session.id}|${e.kind}|${e.phase}|${e.start}|${e.seq}`,
        kind: e.kind,
        left: c.left,
        width: c.width,
        label: e.label,
        isPoint: e.start === e.end,
        past: e.end < w.from,
        superseded: e.kind === 'exam' && supersededPhases.has(`${session.id}|${e.phase}`),
      }];
    });

    const markers: Marker[] = picked.flatMap(r => {
      const c = clip(r.examDate!, r.examDate!, w);
      if (!c) return [];
      return [{ key: r.key, left: c.left, label: `${nameOf(r.plan.examSlug)} ${r.option?.label ?? ''}`.trim() }];
    });

    const head = nameOf(slugs[0]!);
    rows.push({
      groupId,
      label: slugs.length > 1 ? `${head} +${slugs.length - 1}` : head,
      examSlugs: slugs,
      agency: group?.agency ?? '',
      dense,
      eventCount: visible.length,
      sessionCount: inWindow.length,
      bars,
      markers,
    });
  }

  return rows.sort((a, b) => a.label.localeCompare(b.label, 'ko'));
}

/** 오늘 위치. 창이 오늘 시작이면 0 이지만, 나중에 창을 옮길 수 있으므로 계산해 둔다 */
export function todayLeft(today: string, w: Window): number {
  const total = diffDays(w.to, w.from);
  if (total <= 0) return 0;
  return Math.min(Math.max(diffDays(today, w.from) / total, 0), 1);
}
