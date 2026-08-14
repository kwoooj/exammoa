/**
 * 사전 렌더한 페이지에 함께 넣을 데이터의 부분집합.
 *
 * 전체 페이로드는 166KB 다. 68개 페이지에 통째로 박으면 dist 가 11MB 가 되고,
 * 시험 하나를 보러 온 사람이 62종목 전부의 일정을 내려받는다.
 *
 * **부분집합도 `RawData` 그대로 돌려준다.** 화면 전용 뷰모델을 따로 만들지 않는
 * 이유가 핵심이다 — 같은 `buildAppData` 를 통과하므로 인덱싱 코드가 한 벌이고,
 * 클라이언트가 나중에 전체 데이터로 바꿔 끼울 때 그것이 **부분집합의 상위집합**이라
 * 이미 그려 둔 것이 다시 쓰이지 않는다. 하이드레이션 불일치가 구조적으로 안 난다.
 */

import type { RouteMatch } from '../lib/routes.ts';
import type { Exam, ScheduleGroup, Session } from '../types.ts';
import type { AppData } from './index.ts';
import type { RawData } from './source.ts';

/** 이 페이지가 어느 범위의 데이터를 들고 있는가 */
export type Scope = 'exam' | 'home' | 'browse' | 'static' | 'full';

export function scopeFor(match: RouteMatch): Scope {
  switch (match.id) {
    case 'exam': return 'exam';
    case 'home': return 'home';
    case 'exams':
    case 'calendar': return 'browse';
    default: return 'static';
  }
}

/** 홈 미리보기는 이번 달과 다음 달까지만 본다 (§5.3-E) */
const HOME_MONTHS_AHEAD = 2;

function addMonthsIso(iso: string, n: number): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) + n;
  const year = y + Math.floor((m - 1) / 12);
  const month = ((m - 1) % 12 + 12) % 12 + 1;
  return `${year}-${String(month).padStart(2, '0')}-31`;
}

function pack(data: AppData, exams: Exam[], groups: ScheduleGroup[], sessions: Session[]): RawData {
  return {
    // links 를 반드시 함께 보낸다. 이게 빠지면 사전 렌더한 페이지의 공식 링크가
    // 47종목에서 사라지고, 그 자리에 "공식 링크 확인 중" 이 박혀 나간다.
    exams: { exams, categories: data.categories, ...(data.raw.exams.links ? { links: data.raw.exams.links } : {}) },
    groups: { year: data.raw.groups.year, groups },
    sessions: { year: data.raw.sessions.year, sessions },
    meta: data.meta,
  };
}

/** 이 종목을 그리는 데 필요한 것만 */
function examSlice(data: AppData, slug: string): RawData {
  const exam = data.examBySlug.get(slug);
  if (!exam) return pack(data, [], [], []);

  // 같은 그룹의 종목(§7.10 "일정이 같은 시험")과 같은 분야의 관련 시험(§7.10)까지.
  const wanted = new Map<string, Exam>([[exam.slug, exam]]);
  for (const e of data.examsByGroup.get(exam.groupId) ?? []) wanted.set(e.slug, e);
  for (const e of (data.categoryExams.get(exam.category) ?? []).slice(0, 5)) wanted.set(e.slug, e);

  const exams = [...wanted.values()];
  // 관련 시험 줄에도 상태 배지가 붙으므로 그 그룹들의 회차까지 필요하다.
  const groupIds = new Set(exams.map(e => e.groupId));
  const groups = data.groups.filter(g => groupIds.has(g.id));
  const sessions = data.sessions.filter(s => groupIds.has(s.groupId));

  return pack(data, exams, groups, sessions);
}

/** 가까운 일정만. 홈은 이번 달 미리보기와 접수 중 목록만 그린다 */
function homeSlice(data: AppData): RawData {
  const from = data.buildDate;
  const to = addMonthsIso(from, HOME_MONTHS_AHEAD);
  const sessions = data.sessions.filter(
    s => s.mode === 'rolling' || s.events.some(e => e.end >= from && e.start <= to),
  );
  const groupIds = new Set(sessions.map(s => s.groupId));
  return pack(
    data,
    data.exams.filter(e => groupIds.has(e.groupId)),
    data.groups.filter(g => groupIds.has(g.id)),
    sessions,
  );
}

/**
 * 탐색과 캘린더는 전체 종목이 필요하다. 대신 **지난 회차를 뺀다** — 과거 일정은
 * 달을 되감았을 때만 쓰이고, 그때는 이미 전체 데이터가 도착해 있다.
 */
function browseSlice(data: AppData): RawData {
  const from = data.buildDate;
  const sessions = data.sessions.filter(
    s => s.mode === 'rolling' || s.events.length === 0 || s.events.some(e => e.end >= from),
  );
  return pack(data, data.exams, data.groups, sessions);
}

/** 소개·개인정보·404 는 목록을 그리지 않는다. 헤더 검색과 푸터만 산다 */
function staticSlice(data: AppData): RawData {
  return pack(data, data.exams, data.groups, []);
}

export function sliceFor(data: AppData, match: RouteMatch): RawData {
  switch (scopeFor(match)) {
    case 'exam': return examSlice(data, match.params.slug ?? '');
    case 'home': return homeSlice(data);
    case 'browse': return browseSlice(data);
    default: return staticSlice(data);
  }
}
