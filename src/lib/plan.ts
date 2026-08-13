/**
 * 응시 계획과 D-Day. 이 서비스의 핵심 계산.
 *
 * 충돌 3단계 판정을 대체한다. 실측상 시험 이벤트의 98%가 기간 시행이라 기간끼리는
 * 거의 항상 겹치고, 그래서 '겹친다' 는 사실 자체가 정보가 되지 못했다 (실제로 화면에
 * 참고 등급 경고가 106건 떴다). 사용자가 응시일을 지정하면 비로소 두 가지가 의미를 갖는다.
 *
 *   1. D-Day — 내가 정한 일정이 며칠 남았는가
 *   2. 같은 날 — 그날 이미 다른 시험을 지정했는가
 */

import type { EventPhase, ExamPlan, PlanKey, Session } from '../types.ts';
import { dDay, dotted, today } from './dates.ts';

/** 같은 종목의 필기·실기를 따로 담아야 하므로 phase 까지 키에 넣는다 */
export function planKey(p: { examSlug: string; sessionId: string; phase: EventPhase }): PlanKey {
  return `${p.examSlug}|${p.sessionId}|${p.phase}`;
}

// ---- 지정 후보 ---------------------------------------------------------

export interface ExamOption {
  phase: EventPhase;
  label: string;
  start: string;
  end: string;
  /** 기간 시행. 응시일을 골라야 D-Day 가 생긴다 */
  isRange: boolean;
  /** 정기접수 마감일 */
  regDeadline: string | null;
}

/**
 * 정기접수 마감일.
 *
 * 빈자리접수(seq 2 이상)는 마감으로 보지 않는다. 빈자리는 시험 직전 이틀짜리 예외
 * 경로인데 그것을 마감으로 알려주면 정기접수를 놓쳐도 괜찮다고 오해하게 된다.
 */
export function regDeadlineOf(session: Session, phase: EventPhase): string | null {
  const regs = session.events.filter(e => e.kind === 'reg' && e.phase === phase);
  if (!regs.length) return null;
  const primary = regs.find(e => e.seq === 1) ?? regs.reduce((a, b) => (a.start <= b.start ? a : b));
  return primary.end;
}

/** 한 회차에서 지정할 수 있는 시험들. 상시시험은 확정 일정이 없어 지정 대상이 아니다. */
export function examOptions(session: Session): ExamOption[] {
  if (session.mode === 'rolling' || session.status === 'tbd') return [];
  return session.events
    .filter(e => e.kind === 'exam')
    .map(e => ({
      phase: e.phase,
      label: e.label,
      start: e.start,
      end: e.end,
      isRange: e.start !== e.end,
      regDeadline: regDeadlineOf(session, e.phase),
    }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

// ---- 계획 해석 ---------------------------------------------------------

export interface ResolvedPlan {
  key: PlanKey;
  plan: ExamPlan;
  session: Session | null;
  option: ExamOption | null;
  /** 확정된 응시일. 기간 시행인데 아직 안 골랐으면 null */
  examDate: string | null;
  /** 기간 시행인데 응시일을 아직 안 골랐다 */
  needsPick: boolean;
  /** 지정한 날짜가 시행 기간을 벗어났다 (데이터가 바뀌면 생길 수 있다) */
  outOfRange: boolean;
  regDeadline: string | null;
}

export function resolvePlan(plan: ExamPlan, sessions: Session[]): ResolvedPlan {
  const key = planKey(plan);
  const session = sessions.find(s => s.id === plan.sessionId) ?? null;
  const option = session ? (examOptions(session).find(o => o.phase === plan.phase) ?? null) : null;

  if (!option) {
    return { key, plan, session, option: null, examDate: null, needsPick: false, outOfRange: false, regDeadline: null };
  }

  // 하루짜리는 고를 것이 없다. 지정값이 있어도 실제 시험일을 쓴다.
  if (!option.isRange) {
    return {
      key, plan, session, option,
      examDate: option.start,
      needsPick: false,
      outOfRange: false,
      regDeadline: option.regDeadline,
    };
  }

  const picked = plan.date ?? null;
  const outOfRange = picked !== null && (picked < option.start || picked > option.end);
  return {
    key, plan, session, option,
    examDate: outOfRange ? null : picked,
    needsPick: picked === null,
    outOfRange,
    regDeadline: option.regDeadline,
  };
}

export function resolvePlans(plans: ExamPlan[], sessions: Session[]): ResolvedPlan[] {
  return plans.map(p => resolvePlan(p, sessions));
}

// ---- D-Day -------------------------------------------------------------

export type DDayKind = 'reg-deadline' | 'exam';

export interface DDayItem {
  id: string;
  planKey: PlanKey;
  kind: DDayKind;
  date: string;
  /** 0 이면 오늘 */
  dday: number;
  examName: string;
  label: string;
}

const KIND_ORDER: Record<DDayKind, number> = { 'reg-deadline': 0, exam: 1 };

/**
 * 가까운 순 D-Day 목록. 시험일과 원서접수 마감일만 담는다.
 *
 * 접수 마감을 넣는 이유: 접수를 놓치면 시험을 아예 못 본다. 실질적 손해는 시험을
 * 못 보는 것보다 접수를 놓치는 데서 나오고, 접수 기간은 보통 4일로 짧다.
 *
 * 지난 항목은 담지 않는다. 오늘(D-0)은 담는다.
 */
export function ddayItems(
  plans: ExamPlan[],
  sessions: Session[],
  nameOf: (slug: string) => string,
  from = today(),
): DDayItem[] {
  const out: DDayItem[] = [];

  for (const r of resolvePlans(plans, sessions)) {
    if (!r.option) continue;
    const examName = nameOf(r.plan.examSlug);

    if (r.regDeadline) {
      const d = dDay(r.regDeadline, from);
      if (d >= 0) {
        out.push({
          id: `${r.key}|reg`,
          planKey: r.key,
          kind: 'reg-deadline',
          date: r.regDeadline,
          dday: d,
          examName,
          label: `${phaseLabel(r.plan.phase)}원서접수 마감`.trim(),
        });
      }
    }

    if (r.examDate) {
      const d = dDay(r.examDate, from);
      if (d >= 0) {
        out.push({
          id: `${r.key}|exam`,
          planKey: r.key,
          kind: 'exam',
          date: r.examDate,
          dday: d,
          examName,
          label: r.option.label,
        });
      }
    }
  }

  return out.sort(
    (a, b) => a.date.localeCompare(b.date) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.examName.localeCompare(b.examName),
  );
}

function phaseLabel(phase: EventPhase): string {
  return phase === 'written' ? '필기 ' : phase === 'practical' ? '실기 ' : '';
}

// ---- 같은 날 -----------------------------------------------------------

export interface Occupant {
  planKey: PlanKey;
  examName: string;
  label: string;
}

/**
 * 그 날짜에 이미 지정해 둔 시험들. 지정한 **시험일끼리만** 본다.
 *
 * 접수 마감이나 발표일까지 포함하면 안내가 자주 떠서 다시 소음이 된다.
 * 드물게 떠야 뜰 때 진짜 신호가 된다.
 */
export function occupantsOn(
  date: string,
  plans: ExamPlan[],
  sessions: Session[],
  nameOf: (slug: string) => string,
  excludeKey?: PlanKey,
): Occupant[] {
  return resolvePlans(plans, sessions)
    .filter(r => r.examDate === date && r.key !== excludeKey && r.option)
    .map(r => ({ planKey: r.key, examName: nameOf(r.plan.examSlug), label: r.option!.label }));
}

/** `이미 2026.10.11에는 정보처리기사 실기시험이 있습니다` */
export function sameDayMessage(date: string, occupants: Occupant[]): string | null {
  if (!occupants.length) return null;
  const first = occupants[0]!;
  const head = `${first.examName} ${first.label}`;
  const rest = occupants.length > 1 ? ` 외 ${occupants.length - 1}건` : '';
  return `이미 ${dotted(date)}에는 ${head}${rest}이 있습니다`;
}
