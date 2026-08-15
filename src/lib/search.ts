/**
 * 통합 검색. 화면정의 §2.2.
 *
 * 검색 대상은 시험명 · 약칭 · 시행기관 · 카테고리명이고, 우선순위는 문서가 정한
 * 다섯 단계다. 순위를 매기는 이유는 목록이 짧아서가 아니라 **정확히 그것을 찾는
 * 사람과 훑어보는 사람이 같은 상자에 입력하기 때문이다.** '정보처리기사' 를 친
 * 사람에게 '정보처리산업기사' 가 먼저 나오면 검색이 고장난 것처럼 읽힌다.
 *
 * 오타 교정과 초성 검색은 하지 않는다. §6.7 이 "자동 교정하지 않고 부분 일치
 * 결과와 유사 시험을 제안" 이라고 못 박았고, 검색어 추천은 §19 의 P2 다.
 *
 * NFC 정규화를 양쪽에 건다. IME 와 붙여넣기가 조합형을 낼 수 있는데 우리 데이터는
 * 완성형이라, 정규화하지 않으면 '정보' 가 '정보처리기사' 에 안 걸린다. 눈으로는
 * 똑같아서 버그를 재현조차 못 한다.
 */

import type { Category, Exam, ScheduleGroup } from '../types.ts';

/** 이 글자 수부터 자동완성을 낸다 (§2.2) */
export const MIN_QUERY = 2;

/** §2.2 의 다섯 단계. 숫자가 작을수록 먼저 */
export type MatchLevel = 1 | 2 | 3 | 4 | 5;

export interface SearchEntry {
  slug: string;
  name: string;
  short: string | null;
  agency: string;
  categoryName: string;
  /** 같은 단계 안에서의 순서. 시드가 정한 큐레이션 값 */
  priority: number;
  /** 비교용 정규화 캐시. 매 입력마다 62번 정규화하지 않기 위해 미리 만든다 */
  keys: { name: string; short: string | null; agency: string; category: string };
}

export interface SearchHit {
  entry: SearchEntry;
  level: MatchLevel;
}

export function normalizeQuery(q: string): string {
  return q.trim().normalize('NFC').toLowerCase();
}

export function buildSearchIndex(
  exams: Exam[],
  groups: ScheduleGroup[],
  categories: Category[],
): SearchEntry[] {
  const groupById = new Map(groups.map(g => [g.id, g]));
  const categoryById = new Map(categories.map(c => [c.id, c.name]));

  return exams.map(exam => {
    // 종목이 기관을 직접 들고 있으면 그것이 정본이다. 한 그룹이 여러 기관의
    // 종목을 담는 경우가 있어서, 그룹만 보면 다른 기관 이름으로 검색된다.
    const agency = exam.agency ?? groupById.get(exam.groupId)?.agency ?? '';
    const categoryName = categoryById.get(exam.category) ?? '';
    return {
      slug: exam.slug,
      name: exam.name,
      short: exam.short,
      agency,
      categoryName,
      priority: exam.priority,
      keys: {
        name: normalizeQuery(exam.name),
        short: exam.short ? normalizeQuery(exam.short) : null,
        agency: normalizeQuery(agency),
        category: normalizeQuery(categoryName),
      },
    };
  });
}

/**
 * 한 항목이 질의에 걸리는 가장 높은 단계. 안 걸리면 null.
 *
 * 약칭도 앞부분·부분 일치에 참여시킨다. §2.2 는 약칭 '정확' 일치만 단계로 적었지만
 * 검색 대상에는 약칭을 넣어 두었다. '정처' 를 친 사람에게 아무것도 안 주는 것은
 * 그 목록의 뜻이 아니다 — 정확 일치를 2번으로 올려 두고, 나머지는 이름과 같은
 * 단계에서 겨루게 한다.
 */
function levelOf(entry: SearchEntry, q: string): MatchLevel | null {
  const { name, short, agency, category } = entry.keys;

  if (name === q) return 1;
  if (short === q) return 2;
  if (name.startsWith(q) || short?.startsWith(q)) return 3;
  if (name.includes(q) || short?.includes(q)) return 4;
  if (agency.includes(q) || category.includes(q)) return 5;
  return null;
}

/**
 * 같은 단계 안의 순서. 시드가 정한 우선순위, 그다음 가나다순.
 *
 * localeCompare 에 'ko' 를 명시한다. 기본 로케일에 맡기면 사용자 환경에 따라
 * 순서가 달라져서 사전 렌더한 HTML 과 브라우저 렌더가 어긋난다.
 */
function tieBreak(a: SearchEntry, b: SearchEntry): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.name.localeCompare(b.name, 'ko');
}

export function searchExams(index: SearchEntry[], query: string, limit?: number): SearchHit[] {
  const q = normalizeQuery(query);
  if (q.length < MIN_QUERY) return [];

  const hits: SearchHit[] = [];
  for (const entry of index) {
    const level = levelOf(entry, q);
    if (level !== null) hits.push({ entry, level });
  }

  hits.sort((a, b) => (a.level !== b.level ? a.level - b.level : tieBreak(a.entry, b.entry)));
  return limit === undefined ? hits : hits.slice(0, limit);
}
