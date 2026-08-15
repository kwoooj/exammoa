/**
 * 목록 한 행을 만들고, 거르고, 정렬한다. 화면정의 §4 · §6.4 · §6.5 · §5.3-C.
 *
 * 세 화면이 같은 행을 쓴다 — S-01 의 "지금 접수할 수 있는 시험", S-02 의 결과,
 * S-03 의 관련 시험. 각자 조립하면 같은 시험이 화면마다 다른 상태로 보이고,
 * 그중 어느 것이 맞는지 사용자가 알 방법이 없다.
 *
 * `AppData` 를 통째로 받지 않고 필요한 것만 받는다. `data/index.ts` 가 이미
 * `lib/` 을 import 하고 있어서 반대 방향을 만들면 순환이 된다. 구조적으로
 * `AppData` 가 이 입력을 만족하므로 호출부는 그냥 넘기면 된다.
 */

import type {
  Category, Exam, ExamEvent, LinksFile, MetaFile, ScheduleGroup, Session,
} from '../types.ts';
import type { ExamStatus, StatusFilter } from './status.ts';
import { compareByUrgency, matchesStatusFilter, statusOfExam } from './status.ts';
import type { OfficialLink } from './links.ts';
import { applyLink, officialLink, primaryLink } from './links.ts';
import type { SourceFreshness } from './freshness.ts';
import { freshnessOfSource } from './freshness.ts';
import type { ExamsQuery, SortKey } from './query.ts';
import { searchExams } from './search.ts';
import type { SearchEntry } from './search.ts';
import type { YearMonth } from './calendar.ts';

export interface ExamRow {
  exam: Exam;
  group: ScheduleGroup | undefined;
  agency: string;
  categoryName: string;
  status: ExamStatus;
  /** 가장 가까운 접수 — 진행 중이면 그것, 아니면 다음 것 (§4.1) */
  nextReg: ExamEvent | null;
  /** 가장 가까운 시험 (§4.1) */
  nextExam: ExamEvent | null;
  /** 목록에 버튼 하나만 둘 때 (§4.2) */
  link: OfficialLink;
  apply: OfficialLink;
  official: OfficialLink;
  freshness: SourceFreshness;
}

export interface BrowseInput {
  exams: Exam[];
  groupById: ReadonlyMap<string, ScheduleGroup>;
  sessionsByGroup: ReadonlyMap<string, Session[]>;
  categoryById: ReadonlyMap<string, Category>;
  meta: MetaFile;
  links: LinksFile;
  jmCds: ReadonlySet<string>;
  today: string;
}

/** 확정 회차의 이벤트만 평평하게. 상시·미공고는 이벤트를 만들지 않는다 */
function eventsOf(sessions: Session[]): ExamEvent[] {
  const out: ExamEvent[] = [];
  for (const s of sessions) {
    if (s.mode === 'rolling' || s.status === 'tbd') continue;
    out.push(...s.events);
  }
  return out;
}

/**
 * 가장 가까운 것 하나.
 *
 * 진행 중인 것을 미래보다 먼저 고른다. 오늘 접수가 열려 있는데 다음 회차의 접수
 * 시작일을 보여주면 지금 할 수 있는 일을 놓친다.
 */
function nearest(events: ExamEvent[], kind: ExamEvent['kind'], today: string): ExamEvent | null {
  const live = events
    .filter(e => e.kind === kind && e.start <= today && today <= e.end)
    .sort((a, b) => a.end.localeCompare(b.end))[0];
  if (live) return live;
  return events
    .filter(e => e.kind === kind && e.start > today)
    .sort((a, b) => a.start.localeCompare(b.start))[0] ?? null;
}

export function buildRows(input: BrowseInput): ExamRow[] {
  const { today } = input;
  return input.exams.map(exam => {
    const group = input.groupById.get(exam.groupId);
    const sessions = input.sessionsByGroup.get(exam.groupId) ?? [];
    const events = eventsOf(sessions);
    const src = sessions.find(s => s.src)?.src;
    return {
      exam,
      group,
      agency: exam.agency ?? group?.agency ?? '',
      categoryName: input.categoryById.get(exam.category)?.name ?? exam.category,
      status: statusOfExam(exam, group, sessions, today),
      nextReg: nearest(events, 'reg', today),
      nextExam: nearest(events, 'exam', today),
      link: primaryLink(exam, group, input.links, input.jmCds),
      apply: applyLink(exam, group, input.links, input.jmCds),
      official: officialLink(exam, group, input.links, input.jmCds),
      freshness: freshnessOfSource(input.meta, src, today),
    };
  });
}

// ---- 거르기 (§6.4) ----------------------------------------------------

/** 그 달에 이 종류의 일정이 하나라도 있는가 */
function hasEventIn(row: ExamRow, month: YearMonth, kinds: ExamsQuery['kinds']): boolean {
  const from = `${month}-01`;
  const to = `${month}-31`;
  const wanted = kinds.length ? kinds : null;
  const events = [row.nextReg, row.nextExam].filter((e): e is ExamEvent => e !== null);
  // nextReg/nextExam 은 '가장 가까운 것' 이라 달 필터에는 부족하다. 상태가 들고 있는
  // 이벤트까지 함께 본다.
  if (row.status.event) events.push(row.status.event);
  return events.some(e => (!wanted || wanted.includes(e.kind)) && e.end >= from && e.start <= to);
}

/**
 * 모든 필터는 AND 로 묶인다 (§6.4).
 *
 * 검색어는 `search.ts` 의 순위를 그대로 쓴다. 여기서 다시 짜면 헤더 자동완성과
 * 목록 결과가 다른 시험을 내놓는다.
 */
export function filterRows(rows: ExamRow[], query: ExamsQuery, index: SearchEntry[]): ExamRow[] {
  let out = rows;

  if (query.q) {
    const rank = new Map(searchExams(index, query.q).map((h, i) => [h.entry.slug, i]));
    // 검색어가 있으면 순위 자체가 정렬이다 — 아래 sortRows 가 이것을 존중한다.
    out = out.filter(r => rank.has(r.exam.slug))
      .sort((a, b) => rank.get(a.exam.slug)! - rank.get(b.exam.slug)!);
  }

  if (query.category) out = out.filter(r => r.exam.category === query.category);
  if (query.agency) out = out.filter(r => r.agency === query.agency);
  if (query.cadence) out = out.filter(r => (r.group?.cadence ?? 'periodic') === query.cadence);
  if (query.status) out = out.filter(r => matchesStatusFilter(r.status, query.status as StatusFilter));
  if (query.month) out = out.filter(r => hasEventIn(r, query.month!, query.kinds));
  else if (query.kinds.length) {
    out = out.filter(r => query.kinds.some(k => (k === 'reg' ? r.nextReg : k === 'exam' ? r.nextExam : r.status.event?.kind === 'result')));
  }

  return out;
}

// ---- 정렬 (§6.5) ------------------------------------------------------

function byName(a: ExamRow, b: ExamRow): number {
  // 로케일을 명시한다. 기본값에 맡기면 사용자 환경마다 순서가 달라져
  // 사전 렌더한 HTML 과 브라우저 렌더가 어긋난다.
  return a.exam.name.localeCompare(b.exam.name, 'ko');
}

/** 날짜 없는 것은 뒤로. 없는 일정이 임박한 일정보다 앞에 오면 안 된다 */
function byDate(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

export function sortRows(rows: ExamRow[], sort: SortKey, searched = false): ExamRow[] {
  // 검색어가 있고 기본 정렬이면 검색 순위를 흐트러뜨리지 않는다.
  if (searched && sort === 'deadline') return rows;

  const out = [...rows];
  switch (sort) {
    case 'name':
      return out.sort(byName);
    case 'exam':
      return out.sort((a, b) => byDate(a.nextExam?.start ?? null, b.nextExam?.start ?? null) || byName(a, b));
    case 'deadline':
    default:
      // §6.5 기본 정렬 — 급한 상태부터. 같은 상태 안에서는 날짜, 그다음 이름.
      return out.sort((a, b) => compareByUrgency(a.status, b.status) || byName(a, b));
  }
}

// ---- 지금 접수할 수 있는 시험 (§5.3-C) ---------------------------------

export interface OpenNowGroup {
  rows: ExamRow[];
  /** 같은 시행그룹이라 접어 둔 나머지 */
  more: ExamRow[];
  groupId: string;
}

/**
 * 접수 종료가 가까운 순. 한 시행그룹에서 너무 많이 나오지 않게 접는다 (§5.3-C).
 *
 * 접지 않으면 국가기술자격 정기검정 하나가 목록 다섯 자리를 전부 차지한다 —
 * 실측상 그 그룹에만 29종목이 같은 일정을 쓴다. 그러면 홈이 "지금 접수 중인
 * 시험" 이 아니라 "정기검정 종목 목록" 이 된다.
 */
export function openNow(rows: ExamRow[], limit = 5, perGroup = 3): OpenNowGroup[] {
  const open = rows
    .filter(r => r.status.id === 'reg-open' || r.status.id === 'reg-closing')
    .sort((a, b) => byDate(a.status.date, b.status.date) || byName(a, b));

  const byGroup = new Map<string, ExamRow[]>();
  for (const row of open) {
    const list = byGroup.get(row.exam.groupId) ?? [];
    list.push(row);
    byGroup.set(row.exam.groupId, list);
  }

  const out: OpenNowGroup[] = [];
  let shown = 0;
  for (const [groupId, list] of byGroup) {
    if (shown >= limit) break;
    const take = Math.min(perGroup, limit - shown, list.length);
    out.push({ groupId, rows: list.slice(0, take), more: list.slice(take) });
    shown += take;
  }
  return out;
}

/** 곧 접수가 시작되는 시험. 접수 중인 것이 하나도 없을 때 대신 보여준다 (§5.4) */
export function startingSoon(rows: ExamRow[], limit = 3): ExamRow[] {
  return rows
    .filter(r => r.status.id === 'reg-upcoming')
    .sort((a, b) => byDate(a.status.date, b.status.date) || byName(a, b))
    .slice(0, limit);
}

/** 분야별 대표 시험 2~3개 (§5.3-D). 전체를 펼치지 않는다 */
export function byCategory(rows: ExamRow[], categories: Category[], perCategory = 3) {
  return categories
    .map(category => ({
      category,
      rows: rows
        .filter(r => r.exam.category === category.id)
        .sort((a, b) => a.exam.priority - b.exam.priority || byName(a, b))
        .slice(0, perCategory),
      total: rows.filter(r => r.exam.category === category.id).length,
    }))
    // 데이터가 없는 카테고리는 아예 숨긴다 (§5.4)
    .filter(c => c.total > 0);
}
