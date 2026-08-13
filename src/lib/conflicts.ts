/**
 * 충돌 탐지. 이 서비스의 핵심 계산.
 *
 * 판정 규칙 (docs/MVP.md 3단계)
 *   blocking  서로 다른 종목의 exam 이벤트가 날짜 단위로 겹침 → 물리적으로 불가능
 *   warning   한쪽 exam 과 다른쪽 reg 종료일이 같은 ISO 주(월~일) → 잊어버리기 쉬운 지점
 *   info      reg 구간끼리 겹침 → 실질 문제 아님
 *
 * warning 만 주 단위인 것은 의도된 비대칭이다. 날짜 단위로 보면
 * "시험 전주에 다른 시험 접수 마감" 케이스를 놓친다.
 */

import type { Conflict, ConflictLevel, ExamEvent, ScheduleGroup, Session } from '../types';
import { diffDays, monthDay, overlaps, sameWeek, today, weekStart, addDays } from './dates';

const LEVEL_ORDER: Record<ConflictLevel, number> = { blocking: 0, warning: 1, info: 2 };

/**
 * 시험이 기간 시행(CBT)인지. 이 기간 안에서 응시일을 고르는 방식이므로
 * 다른 시험과 기간이 겹쳐도 실제로는 피할 수 있다.
 *
 * 실측 근거: 정보처리기사 2026 필기가 08/07~09/01 로 26일. 이런 창끼리는
 * 거의 항상 겹치므로 blocking 으로 잡으면 경고가 전부 소음이 된다.
 */
const FLEXIBLE_MIN_DAYS = 3;

export function isFlexible(event: ExamEvent): boolean {
  return diffDays(event.end, event.start) + 1 > FLEXIBLE_MIN_DAYS;
}

/**
 * 판정 단위는 그룹이다. 종목이 아니다.
 *
 * 같은 그룹 종목들은 일정이 동일하므로(실측: 29종목이 한 그룹) 종목 단위로 비교하면
 * 같은 날짜끼리 자기 자신과 비교하는 충돌이 수백 건 쏟아진다. examSlug 는 화면에
 * 무엇을 보여줄지를 위한 표시용이다.
 */
interface Flat {
  groupId: string;
  examSlug: string;
  event: ExamEvent;
}

/** groupId → 그 그룹을 대표해 화면에 보일 종목 slug */
export type GroupPick = Map<string, string>;

/**
 * 그룹마다 표시할 종목을 정한다. 사용자가 고른 종목이 있으면 그것을 쓰고,
 * 없으면 그룹의 첫 종목을 쓴다.
 */
export function pickRepresentatives(
  groups: ScheduleGroup[],
  selected?: Iterable<string>,
): GroupPick {
  const chosen = selected ? new Set(selected) : null;
  const out: GroupPick = new Map();
  for (const g of groups) {
    const hit = chosen ? g.examSlugs.find(s => chosen.has(s)) : undefined;
    const rep = hit ?? g.examSlugs[0];
    if (rep) out.set(g.id, rep);
  }
  return out;
}

function flatten(sessions: Session[], from: string, pick: GroupPick): Flat[] {
  const out: Flat[] = [];
  for (const s of sessions) {
    if (s.mode === 'rolling' || s.status === 'tbd') continue; // 상시시험·미공고는 판정 대상 아님
    for (const event of s.events) {
      if (event.end < from) continue; // 지난 이벤트 제외
      out.push({ groupId: s.groupId, examSlug: pick.get(s.groupId) ?? s.groupId, event });
    }
  }
  return out;
}

function nameOf(slug: string, names: Map<string, string>): string {
  return names.get(slug) ?? slug;
}

export function detectConflicts(
  sessions: Session[],
  groups: ScheduleGroup[],
  examNames: Map<string, string>,
  from = today(),
  selected?: Iterable<string>,
): Conflict[] {
  const flat = flatten(sessions, from, pickRepresentatives(groups, selected));
  const found: Conflict[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < flat.length; i++) {
    for (let j = i + 1; j < flat.length; j++) {
      const a = flat[i];
      const b = flat[j];
      if (!a || !b) continue;
      if (a.groupId === b.groupId) continue; // 같은 그룹 내부는 충돌이 아니다 (일정이 같으므로)

      const conflict = judge(a, b, examNames);
      if (!conflict) continue;

      // 같은 쌍이 양방향으로 두 번 잡히는 것을 막는다
      const key = [conflict.level, ...[keyOf(a), keyOf(b)].sort()].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(conflict);
    }
  }

  return found.sort(
    (x, y) => LEVEL_ORDER[x.level] - LEVEL_ORDER[y.level] || x.start.localeCompare(y.start),
  );
}

function keyOf(f: Flat): string {
  return `${f.groupId}:${f.event.kind}:${f.event.phase}:${f.event.start}:${f.event.seq}`;
}

function judge(a: Flat, b: Flat, names: Map<string, string>): Conflict | null {
  const an = nameOf(a.examSlug, names);
  const bn = nameOf(b.examSlug, names);

  // blocking — 시험일끼리 날짜 겹침. 단 한쪽이라도 기간 시행이면 응시일을 조정할 수 있으므로 제외한다.
  if (a.event.kind === 'exam' && b.event.kind === 'exam') {
    if (!overlaps(a.event.start, a.event.end, b.event.start, b.event.end)) return null;
    if (isFlexible(a.event) || isFlexible(b.event)) return null;
    const start = a.event.start > b.event.start ? a.event.start : b.event.start;
    const end = a.event.end < b.event.end ? a.event.end : b.event.end;
    return {
      level: 'blocking',
      start,
      end,
      a,
      b,
      message: `${monthDay(start)} — ${an}와 ${bn} 시험일이 같은 날이에요. 하나를 선택해야 해요`,
    };
  }

  // warning — 한쪽 시험일과 다른쪽 접수 마감일이 같은 주
  const pair =
    a.event.kind === 'exam' && b.event.kind === 'reg'
      ? { exam: a, reg: b, examName: an, regName: bn }
      : b.event.kind === 'exam' && a.event.kind === 'reg'
        ? { exam: b, reg: a, examName: bn, regName: an }
        : null;

  if (pair) {
    // 기간 시행 시험은 "시험 준비 주"가 특정되지 않으므로 이 판정에서 제외한다.
    if (isFlexible(pair.exam.event)) return null;
    if (!sameWeek(pair.exam.event.start, pair.reg.event.end)) return null;
    const ws = weekStart(pair.exam.event.start);
    return {
      level: 'warning',
      start: ws,
      end: addDays(ws, 6),
      a,
      b,
      message: `${monthDay(ws)} 주 — ${pair.examName} 시험일과 ${pair.regName} ${pair.reg.event.label}이 겹칩니다`,
    };
  }

  // info — 접수 구간끼리 겹침
  if (a.event.kind === 'reg' && b.event.kind === 'reg') {
    if (!overlaps(a.event.start, a.event.end, b.event.start, b.event.end)) return null;
    const start = a.event.start > b.event.start ? a.event.start : b.event.start;
    const end = a.event.end < b.event.end ? a.event.end : b.event.end;
    return {
      level: 'info',
      start,
      end,
      a,
      b,
      message: `${an}와 ${bn} 접수 기간이 겹쳐요. 순서만 확인하세요`,
    };
  }

  return null;
}

export function summarize(conflicts: Conflict[]): { blocking: number; warning: number; info: number } {
  return {
    blocking: conflicts.filter(c => c.level === 'blocking').length,
    warning: conflicts.filter(c => c.level === 'warning').length,
    info: conflicts.filter(c => c.level === 'info').length,
  };
}
