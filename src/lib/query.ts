/**
 * URL 질의 문자열 ↔ 화면 상태. 화면정의 §6.2 · §8.2 · §17.
 *
 * 검색·필터·정렬·선택한 시험·보고 있는 달은 전부 URL 에 남는다. 새로고침, 뒤로
 * 가기, 링크 공유 뒤에도 결과가 같아야 한다. 이 파일이 그 계약의 정본이고, 세 화면
 * (S-01 바로가기 · S-02 탐색 · S-04 캘린더)이 같은 함수를 쓴다 — 각자 파싱하면
 * 홈의 바로가기가 만든 URL 을 탐색 화면이 다르게 읽는 일이 생긴다.
 *
 * **모르는 값은 버리고 던지지 않는다.** 남이 보낸 링크나 손으로 고친 주소가 화면
 * 전체를 죽이면 안 된다. 다만 `exams=` 의 유효하지 않은 slug 만은 조용히 버리지
 * 않고 `missing` 으로 돌려준다 — §8.12 가 "일부 시험을 찾지 못했어요" 를 요구한다.
 * 조용히 지우면 사용자는 자기가 고른 시험이 왜 사라졌는지 알 수 없다.
 *
 * 기본값은 직렬화하지 않는다. `/exams` 와 `/exams?sort=deadline&q=` 가 같은 화면인데
 * 주소만 다르면 공유된 링크가 지저분해지고 canonical 판단도 흐려진다.
 */

import type { Cadence, EventKind } from '../types.ts';
import type { YearMonth } from './calendar.ts';
import type { StatusFilter } from './status.ts';

export type SortKey = 'deadline' | 'exam' | 'name';

/** 캘린더에 함께 올릴 수 있는 시험 수 (§6.6 · §8.3) */
export const MAX_CALENDAR_EXAMS = 6;

const STATUS_VALUES: readonly StatusFilter[] = ['open', 'upcoming', 'exam-upcoming', 'rolling', 'tbd'];
const SORT_VALUES: readonly SortKey[] = ['deadline', 'exam', 'name'];
const KIND_VALUES: readonly EventKind[] = ['reg', 'exam', 'result'];
const CADENCE_VALUES: readonly Cadence[] = ['periodic', 'frequent', 'rolling'];
const MONTH_SHAPE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const DEFAULT_SORT: SortKey = 'deadline';

/** 데이터에 실제로 있는 값들. 없는 카테고리·기관으로 필터가 걸리면 결과가 늘 0 이다 */
export interface KnownValues {
  categoryIds?: readonly string[];
  agencies?: readonly string[];
  slugs?: readonly string[];
}

export interface ExamsQuery {
  q: string;
  category: string | null;
  status: StatusFilter | null;
  /** `date=2026-10` */
  month: YearMonth | null;
  kinds: EventKind[];
  cadence: Cadence | null;
  agency: string | null;
  sort: SortKey;
}

export interface CalendarQuery {
  /** 최대 6개 (§8.3) */
  exams: string[];
  month: YearMonth | null;
  category: string | null;
  kinds: EventKind[];
}

function params(search: string): URLSearchParams {
  // location.search 는 '?' 를 포함하고, 통째로 넘어오는 href 도 있다.
  const i = search.indexOf('?');
  return new URLSearchParams(i === -1 ? search : search.slice(i + 1));
}

function oneOf<T extends string>(raw: string | null, allowed: readonly T[]): T | null {
  return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

function monthOf(raw: string | null): YearMonth | null {
  return raw !== null && MONTH_SHAPE.test(raw) ? raw : null;
}

/** 쉼표로 나뉜 목록. 중복과 모르는 값을 버리고 선언 순서로 되돌린다 */
function listOf<T extends string>(raw: string | null, allowed: readonly T[]): T[] {
  if (!raw) return [];
  const found = new Set(raw.split(',').map(s => s.trim()));
  // 입력 순서가 아니라 선언 순서로 정규화한다 — 같은 뜻의 URL 이 두 가지가 되지 않게.
  return allowed.filter(v => found.has(v));
}

function known(raw: string | null, list: readonly string[] | undefined): string | null {
  if (raw === null || raw === '') return null;
  if (!list) return raw; // 목록을 안 주면 검사하지 않는다
  return list.includes(raw) ? raw : null;
}

export function parseExamsQuery(search: string, values: KnownValues = {}): ExamsQuery {
  const p = params(search);
  return {
    q: (p.get('q') ?? '').trim(),
    category: known(p.get('category'), values.categoryIds),
    status: oneOf(p.get('status'), STATUS_VALUES),
    month: monthOf(p.get('date')),
    // §5.3-B 의 홈 바로가기는 `kind=exam` 단수로 쓴다. 둘 다 받는다.
    kinds: listOf(p.get('kinds') ?? p.get('kind'), KIND_VALUES),
    cadence: oneOf(p.get('cadence'), CADENCE_VALUES),
    agency: known(p.get('agency'), values.agencies),
    sort: oneOf(p.get('sort'), SORT_VALUES) ?? DEFAULT_SORT,
  };
}

export function toExamsSearch(query: ExamsQuery): string {
  const p = new URLSearchParams();
  if (query.q) p.set('q', query.q);
  if (query.category) p.set('category', query.category);
  if (query.status) p.set('status', query.status);
  if (query.month) p.set('date', query.month);
  if (query.kinds.length) p.set('kinds', query.kinds.join(','));
  if (query.cadence) p.set('cadence', query.cadence);
  if (query.agency) p.set('agency', query.agency);
  if (query.sort !== DEFAULT_SORT) p.set('sort', query.sort);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function parseCalendarQuery(
  search: string,
  values: KnownValues = {},
): { query: CalendarQuery; missing: string[] } {
  const p = params(search);

  const raw = (p.get('exams') ?? '')
    .split(',')
    .map(s => s.trim().normalize('NFC'))
    .filter(Boolean);

  const seen = new Set<string>();
  const exams: string[] = [];
  const missing: string[] = [];
  for (const slug of raw) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    if (values.slugs && !values.slugs.includes(slug)) { missing.push(slug); continue; }
    // 상한을 넘긴 것도 '못 찾은 것' 과 같이 알린다. 조용히 자르면 여섯 번째부터
    // 왜 안 보이는지 알 수 없다.
    if (exams.length >= MAX_CALENDAR_EXAMS) { missing.push(slug); continue; }
    exams.push(slug);
  }

  return {
    query: {
      exams,
      month: monthOf(p.get('month')),
      category: known(p.get('category'), values.categoryIds),
      kinds: listOf(p.get('kinds') ?? p.get('kind'), KIND_VALUES),
    },
    missing,
  };
}

export function toCalendarSearch(query: CalendarQuery): string {
  const p = new URLSearchParams();
  if (query.exams.length) p.set('exams', query.exams.slice(0, MAX_CALENDAR_EXAMS).join(','));
  if (query.month) p.set('month', query.month);
  if (query.category) p.set('category', query.category);
  if (query.kinds.length) p.set('kinds', query.kinds.join(','));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** 걸려 있는 필터 수. §6.7 의 "적용된 필터 요약" 과 초기화 버튼 노출에 쓴다 */
export function activeFilterCount(query: ExamsQuery): number {
  return [
    query.q !== '',
    query.category !== null,
    query.status !== null,
    query.month !== null,
    query.kinds.length > 0,
    query.cadence !== null,
    query.agency !== null,
  ].filter(Boolean).length;
}

export const EMPTY_EXAMS_QUERY: ExamsQuery = {
  q: '', category: null, status: null, month: null, kinds: [], cadence: null, agency: null,
  sort: DEFAULT_SORT,
};
