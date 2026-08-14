/**
 * 인덱스를 만드는 유일한 곳.
 *
 * 예전 `App.tsx` 는 렌더마다 `new Map(exams.map(...))` 를 네 번 만들었다. 한 화면일
 * 때는 티가 안 났지만 라우트가 일곱이 되면 각 화면이 자기 방식으로 조인하게 되고,
 * 그러면 "종목의 기관은 무엇인가" 같은 물음에 화면마다 다른 답이 나온다.
 *
 * **부분 실패로 전체를 멈추지 않는다.** 그룹이 선언한 종목이 게시 데이터에 없는
 * 일이 실제로 있다 — tier X 종목(정보보안기사·전산회계운용사2급)은 `exams.json`
 * 에서 빠진다. 그런 slug 는 조용히 걸러내고, 그룹을 못 찾는 종목도 살려 둔다.
 * 모든 호출부가 `ScheduleGroup | undefined` 를 받도록 타입으로 강제한다.
 */

import type { Category, Exam, LinksFile, MetaFile, ScheduleGroup, Session } from '../types.ts';
import { jmCdWhitelist, readLinks } from '../lib/links.ts';
import { buildSearchIndex, type SearchEntry } from '../lib/search.ts';
import type { RawData } from './source.ts';

export interface AppData {
  raw: RawData;

  exams: Exam[];
  groups: ScheduleGroup[];
  sessions: Session[];
  categories: Category[];
  meta: MetaFile;
  links: LinksFile;

  examBySlug: ReadonlyMap<string, Exam>;
  groupById: ReadonlyMap<string, ScheduleGroup>;
  categoryById: ReadonlyMap<string, Category>;
  /** 그룹 id → 그 그룹의 회차. 첫 이벤트 날짜순 */
  sessionsByGroup: ReadonlyMap<string, Session[]>;
  /** 그룹 id → 게시 데이터에 실제로 있는 종목만 */
  examsByGroup: ReadonlyMap<string, Exam[]>;
  categoryExams: ReadonlyMap<string, Exam[]>;

  /** §6.4 기관 필터. 데이터에 실제로 있는 것만, 가나다순 */
  agencies: string[];
  /** 공식 링크 조립용 화이트리스트 */
  jmCds: ReadonlySet<string>;
  search: SearchEntry[];

  /** 이 산출물이 만들어진 날 (YYYY-MM-DD). 사전 렌더가 '오늘' 로 쓴다 */
  buildDate: string;
}

/** 회차 정렬 키. 이벤트가 없으면 맨 뒤로 */
function firstEventDate(session: Session): string {
  let min: string | null = null;
  for (const e of session.events) if (min === null || e.start < min) min = e.start;
  return min ?? '9999-12-31';
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function buildAppData(raw: RawData): AppData {
  const exams = raw.exams.exams;
  const groups = raw.groups.groups;
  const sessions = raw.sessions.sessions;
  const categories = raw.exams.categories;

  const examBySlug = new Map(exams.map(e => [e.slug, e]));
  const groupById = new Map(groups.map(g => [g.id, g]));
  const categoryById = new Map(categories.map(c => [c.id, c]));

  const sessionsByGroup = new Map<string, Session[]>();
  for (const s of sessions) pushTo(sessionsByGroup, s.groupId, s);
  for (const list of sessionsByGroup.values()) {
    list.sort((a, b) => {
      const d = firstEventDate(a).localeCompare(firstEventDate(b));
      return d !== 0 ? d : a.id.localeCompare(b.id);
    });
  }

  const examsByGroup = new Map<string, Exam[]>();
  const categoryExams = new Map<string, Exam[]>();
  for (const e of exams) {
    pushTo(examsByGroup, e.groupId, e);
    pushTo(categoryExams, e.category, e);
  }
  for (const list of categoryExams.values()) {
    list.sort((a, b) => (a.priority !== b.priority ? a.priority - b.priority : a.name.localeCompare(b.name, 'ko')));
  }

  /**
   * 기관 목록은 `groups` 전체에서 만든다. 회차가 0 인 그룹도 남긴다 — 그 기관의
   * 시험을 찾는 사람이 필터에서 기관 자체를 못 찾으면 없는 서비스처럼 보인다.
   * (푸터의 시행그룹 수는 이것과 다르다. 그쪽은 meta.groupCount 를 쓴다.)
   */
  const agencies = [...new Set([
    ...groups.map(g => g.agency),
    ...exams.map(e => e.agency).filter((a): a is string => !!a),
  ])].sort((a, b) => a.localeCompare(b, 'ko'));

  const links = readLinks(raw.exams);

  return {
    raw,
    exams, groups, sessions, categories, meta: raw.meta, links,
    examBySlug, groupById, categoryById, sessionsByGroup, examsByGroup, categoryExams,
    agencies,
    jmCds: jmCdWhitelist(exams),
    search: buildSearchIndex(exams, groups, categories),
    buildDate: raw.meta.fetchedAt.slice(0, 10),
  };
}

// ---- 자주 쓰는 조인 ----------------------------------------------------

export function groupOf(data: AppData, exam: Exam): ScheduleGroup | undefined {
  return data.groupById.get(exam.groupId);
}

export function sessionsOf(data: AppData, exam: Exam): Session[] {
  return data.sessionsByGroup.get(exam.groupId) ?? [];
}

/** 종목의 시행기관. 종목이 직접 들고 있으면 그것이 정본이다 */
export function agencyOf(data: AppData, exam: Exam): string {
  return exam.agency ?? data.groupById.get(exam.groupId)?.agency ?? '';
}

/** 그 그룹의 일정을 함께 쓰는 다른 종목들 (§7.10 "일정이 같은 시험") */
export function siblingsOf(data: AppData, exam: Exam): Exam[] {
  return (data.examsByGroup.get(exam.groupId) ?? []).filter(e => e.slug !== exam.slug);
}

/**
 * §7.10 관련 시험. 같은 분야에서 최대 4개.
 * 추천 알고리즘인 척하지 않는다 — 같은 카테고리에서 우선순위 순으로 고를 뿐이다.
 */
export function relatedExams(data: AppData, exam: Exam, limit = 4): Exam[] {
  return (data.categoryExams.get(exam.category) ?? [])
    .filter(e => e.slug !== exam.slug)
    .slice(0, limit);
}
