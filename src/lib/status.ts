/**
 * 대표 상태. 화면정의 §3.1(우선순위) · §3.2(표현) · §16.1(문구).
 *
 * 상태는 **저장하지 않고 화면에서 계산한다.** 정적 사이트라 만든 시점과 보는 시점이
 * 다르다. "접수 D-2" 를 JSON 에 박으면 이틀 뒤에는 거짓말이 된다.
 *
 * 판정 순서가 표의 순서와 다르다는 점이 중요하다. 표는 우선순위이고, 코드는
 * **먼저 걸러야 할 것부터** 본다:
 *
 *   상시시험 → 미공고 → 연도 가드 → 1~6번 → 종료
 *
 * 상시시험을 맨 앞에 두는 이유: 상시 그룹은 `events` 가 비어 있어서 1~6번이 아예
 * 발화하지 않는다. 그대로 두면 "확정 일정이 없다" 는 사실이 "일정 미공고" 로 잘못
 * 흘러간다. 둘은 완전히 다른 정보다 — 상시는 아무 때나 볼 수 있는 것이고 미공고는
 * 아직 못 보는 것이다.
 *
 * 연도 가드는 날짜가 정해진 버그를 막는다. 2027-01-01 이 되면 모든 정기 그룹의
 * 이벤트가 전부 과거가 되어 9번(종료)이 걸린다. 하지만 참인 답은 "올해 일정 종료"
 * 가 아니라 "2027년 일정이 아직 발표되지 않았어요" 다.
 */

import type { Cadence, ExamEvent, Exam, ScheduleGroup, Session } from '../types.ts';
import { dDay, monthDay } from './dates.ts';

export type StatusId =
  | 'reg-closing'     // 1 접수 마감 임박
  | 'reg-open'        // 2 접수 중
  | 'exam-ongoing'    // 3 시험 기간
  | 'reg-upcoming'    // 4 접수 예정
  | 'exam-upcoming'   // 5 시험 예정
  | 'result-upcoming' // 6 결과 발표 예정
  | 'rolling'         // 7 상시시험
  | 'tbd'             // 8 일정 미공고
  | 'ended';          // 9 종료

/** 접수 종료까지 며칠 이하를 '임박' 으로 볼 것인가 (§3.1) */
export const REG_CLOSING_DAYS = 3;

export interface ExamStatus {
  id: StatusId;
  /** §3.1 의 우선순위 1~9. §3.2 "긴급 상태는 결과 정렬에도 반영한다" 의 1차 키다 */
  rank: number;
  /** 화면 문구. §16.1 정본 */
  label: string;
  /**
   * 접근성 이름. §14 — `D-2` 만 읽어서는 무엇이 이틀 남았는지 알 수 없으므로
   * 대상 이벤트를 포함한다. 종목명은 넣지 않는다. 배지가 놓이는 행이 이미 종목명을
   * 읽어 주기 때문이고, 배지가 홀로 설 때는 호출부가 앞에 붙인다.
   */
  a11yLabel: string;
  /** §3.2 — 접수 중과 접수 D-N 만 강조색을 쓴다 */
  emphasis: boolean;
  /** 이 상태를 만든 이벤트. 상시·미공고·종료는 null */
  event: ExamEvent | null;
  session: Session | null;
  /** 정렬 2차 키. 이 상태가 가리키는 날짜 */
  date: string | null;
}

/** §6.4 상태 필터 · §5.3-B 홈 바로가기 */
export type StatusFilter = 'open' | 'upcoming' | 'exam-upcoming' | 'rolling' | 'tbd';

interface Pair {
  session: Session;
  event: ExamEvent;
}

function make(
  id: StatusId,
  rank: number,
  label: string,
  a11yLabel: string,
  opts: { emphasis?: boolean; pair?: Pair; date?: string | null } = {},
): ExamStatus {
  return {
    id,
    rank,
    label,
    a11yLabel,
    emphasis: opts.emphasis ?? false,
    event: opts.pair?.event ?? null,
    session: opts.pair?.session ?? null,
    date: opts.date ?? null,
  };
}

/** 확정 일정을 가진 회차만. 상시와 미공고는 이벤트를 만들지 않는다 */
function scheduledPairs(sessions: Session[]): Pair[] {
  const out: Pair[] = [];
  for (const session of sessions) {
    if (session.mode === 'rolling' || session.status === 'tbd') continue;
    for (const event of session.events) out.push({ session, event });
  }
  return out;
}

/** 시작이 이른 것부터 */
function byStart(a: Pair, b: Pair): number {
  return a.event.start < b.event.start ? -1 : a.event.start > b.event.start ? 1 : 0;
}

/** 끝이 이른 것부터 — 마감이 가까운 접수를 고를 때 쓴다 */
function byEnd(a: Pair, b: Pair): number {
  return a.event.end < b.event.end ? -1 : a.event.end > b.event.end ? 1 : 0;
}

function isRolling(group: ScheduleGroup | undefined, sessions: Session[]): boolean {
  if (group?.cadence === 'rolling') return true;
  // 그룹 선언이 없어도 회차가 전부 상시면 상시다. 둘 중 하나만 보면 시드와
  // 수집 결과가 어긋났을 때 없는 일정을 기다리게 된다.
  return sessions.length > 0 && sessions.every(s => s.mode === 'rolling');
}

const ROLLING = make('rolling', 7, '상시시험', '상시시험. 확정된 시험일이 없습니다');
const TBD = make('tbd', 8, '일정 미공고', '아직 공식 일정이 발표되지 않았습니다');

/**
 * 그룹 하나의 대표 상태. 일정의 주체는 종목이 아니라 시행그룹이다.
 *
 * `sessions` 는 그 그룹의 회차만 넘긴다. 전체를 넘기면 다른 그룹의 일정으로
 * 상태가 만들어진다 — 호출부가 걸러서 준다.
 */
export function statusOfGroup(
  group: ScheduleGroup | undefined,
  sessions: Session[],
  today: string,
): ExamStatus {
  if (isRolling(group, sessions)) return ROLLING;

  const pairs = scheduledPairs(sessions);
  if (pairs.length === 0) return TBD;

  /**
   * 연도 가드. 가진 일정이 전부 지난 해의 것이면 "종료" 가 아니라 "미공고" 다.
   * 새해 첫날 62개 종목이 한꺼번에 "올해 일정 종료" 라고 말하는 것을 막는다.
   */
  const latestYear = Math.max(...sessions.map(s => s.year));
  if (latestYear < Number(today.slice(0, 4))) return TBD;

  const ongoing = (p: Pair) => p.event.start <= today && today <= p.event.end;
  const future = (p: Pair) => p.event.start > today;

  // 1·2번 — 진행 중인 접수. 여러 개면 먼저 닫히는 것이 급하다.
  const openReg = pairs.filter(p => p.event.kind === 'reg' && ongoing(p)).sort(byEnd)[0];
  if (openReg) {
    const left = dDay(openReg.event.end, today);
    const what = openReg.event.label; // '실기 원서접수' · '취소좌석 접수' 등 원본 문구
    if (left <= REG_CLOSING_DAYS) {
      const label = left === 0 ? '접수 오늘 마감' : `접수 D-${left}`;
      const spoken = left === 0 ? `${what} 오늘 마감` : `${what} 마감 ${left}일 전`;
      return make('reg-closing', 1, label, spoken, { emphasis: true, pair: openReg, date: openReg.event.end });
    }
    return make(
      'reg-open', 2,
      `접수 중 · ${monthDay(openReg.event.end)}까지`,
      `${what} 진행 중. ${monthDay(openReg.event.end)}까지`,
      { emphasis: true, pair: openReg, date: openReg.event.end },
    );
  }

  // 3번 — 시험 기간. 필기 CBT 처럼 여러 날에 걸쳐 치르는 시행이 여기 걸린다.
  const ongoingExam = pairs.filter(p => p.event.kind === 'exam' && ongoing(p)).sort(byEnd)[0];
  if (ongoingExam) {
    return make(
      'exam-ongoing', 3, '시험 진행 중',
      `${ongoingExam.event.label} 진행 중. ${monthDay(ongoingExam.event.end)}까지`,
      { pair: ongoingExam, date: ongoingExam.event.end },
    );
  }

  // 4번 — 다가오는 접수
  const nextReg = pairs.filter(p => p.event.kind === 'reg' && future(p)).sort(byStart)[0];
  if (nextReg) {
    return make(
      'reg-upcoming', 4, `${monthDay(nextReg.event.start)} 접수 시작`,
      `${nextReg.event.label} ${monthDay(nextReg.event.start)} 시작`,
      { pair: nextReg, date: nextReg.event.start },
    );
  }

  // 5번 — 접수는 끝났고 시험이 남았다
  const nextExam = pairs.filter(p => p.event.kind === 'exam' && future(p)).sort(byStart)[0];
  if (nextExam) {
    return make(
      'exam-upcoming', 5, `${monthDay(nextExam.event.start)} 시험 시작`,
      `${nextExam.event.label} ${monthDay(nextExam.event.start)} 시작`,
      { pair: nextExam, date: nextExam.event.start },
    );
  }

  // 6번 — 발표만 남았다
  const nextResult = pairs.filter(p => p.event.kind === 'result' && future(p)).sort(byStart)[0];
  if (nextResult) {
    return make(
      'result-upcoming', 6, `${monthDay(nextResult.event.start)} 발표`,
      `${nextResult.event.label} ${monthDay(nextResult.event.start)}`,
      { pair: nextResult, date: nextResult.event.start },
    );
  }

  return make('ended', 9, '올해 일정 종료', '올해 남은 일정이 없습니다');
}

/**
 * 종목 하나의 대표 상태.
 *
 * 종목이 상시라고 선언하면 그룹보다 우선한다. 시드 무결성 검사가 둘을 맞춰 두지만,
 * 화면이 그것에 기대면 검사가 느슨해진 날 없는 일정을 기다리는 카드가 나온다.
 */
export function statusOfExam(
  exam: Exam,
  group: ScheduleGroup | undefined,
  sessions: Session[],
  today: string,
): ExamStatus {
  if (exam.rolling) return ROLLING;
  return statusOfGroup(group, sessions, today);
}

/**
 * §6.5 기본 정렬. 급한 것부터.
 *
 * 이름 비교는 여기서 하지 않는다. 이 모듈은 종목명을 모르고, 넘겨받으면 같은 정보가
 * 두 곳에 생긴다. 호출부가 마지막 키로 붙인다.
 */
export function compareByUrgency(a: ExamStatus, b: ExamStatus): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  if (a.date === b.date) return 0;
  // 날짜 없는 상태(상시·미공고·종료)는 뒤로 보낸다
  if (a.date === null) return 1;
  if (b.date === null) return -1;
  return a.date < b.date ? -1 : 1;
}

export function matchesStatusFilter(status: ExamStatus, filter: StatusFilter): boolean {
  switch (filter) {
    case 'open': return status.id === 'reg-open' || status.id === 'reg-closing';
    case 'upcoming': return status.id === 'reg-upcoming';
    case 'exam-upcoming': return status.id === 'exam-upcoming';
    case 'rolling': return status.id === 'rolling';
    case 'tbd': return status.id === 'tbd';
  }
}

/** §6.4 유형 필터. 그룹의 시행 주기를 사람 말로 */
export const CADENCE_LABEL: Record<Cadence, string> = {
  periodic: '정기',
  frequent: '고빈도',
  rolling: '상시',
};
