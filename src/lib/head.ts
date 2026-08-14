/**
 * 페이지 머리말. 화면정의 §7.2.
 *
 * 사전 렌더가 이것을 HTML 소스에 박는다. 검색엔진 → S-03 이 §1.2 의 첫 번째 유입
 * 경로인데, 자바스크립트로 나중에 제목을 바꾸면 크롤러가 읽는 첫 HTML 은 비어 있다.
 *
 * **구조화 데이터는 확정된 미래 일정이 있을 때만 낸다.** 상시시험과 미공고에
 * 날짜를 지어 넣으면 규칙 4 위반에 검색엔진이라는 확성기가 붙는다 — 우리 화면에서
 * 한 번 틀리는 것과, 구글 검색 결과에 틀린 시험일이 뜨는 것은 무게가 다르다.
 *
 * canonical 에서 쿼리를 뗀다. §7.2 가 "연도 파라미터가 있어도 기본 slug URL" 이라
 * 했고, 그러지 않으면 `/exams?` 의 필터 조합이 무한한 크롤 공간이 된다.
 */

import type { Exam, ScheduleGroup, Session } from '../types.ts';
import type { RouteMatch } from './routes.ts';
import { NOT_FOUND_PATH, ROUTE_PATHS, examPath } from './routes.ts';
import { statusOfExam } from './status.ts';
import { rangeLabel } from './dates.ts';

export const SITE_NAME = '시험모아';

export interface HeadMeta {
  title: string;
  description: string;
  /** 절대 주소. 사이트맵과 같은 origin 을 쓴다 */
  canonical: string;
  /** 색인하지 말아야 할 페이지에만 */
  robots?: string;
  /** JSON-LD. 확정 일정이 있을 때만 */
  jsonLd?: unknown;
}

export interface HeadInput {
  match: RouteMatch;
  today: string;
  origin: string;
  /** 상세 페이지일 때만 */
  exam?: Exam | undefined;
  group?: ScheduleGroup | undefined;
  sessions?: Session[];
  /** 푸터·소개에 쓰는 규모 */
  counts?: { exams: number; groups: number };
  officialUrl?: string | null;
}

function absolute(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, '')}${path}`;
}

const YEAR_OF = (today: string) => today.slice(0, 4);

/**
 * 상세 페이지 설명문. 가장 가까운 접수 또는 시험을 담는다 (§7.2).
 *
 * 일정이 없으면 없다고 쓴다. "곧 공개됩니다" 같은 말을 지어내면 검색 결과에서
 * 기대를 만들고 들어온 사람이 빈 화면을 본다.
 */
function examDescription(exam: Exam, group: ScheduleGroup | undefined, sessions: Session[], today: string): string {
  const agency = exam.agency ?? group?.agency ?? '';
  const status = statusOfExam(exam, group, sessions, today);
  const head = agency ? `${agency} 시행 ${exam.name}` : exam.name;

  if (status.event) {
    const when = rangeLabel(status.event.start, status.event.end);
    return `${head}의 ${status.event.label} 일정은 ${when} 입니다. 접수·시험·발표 일정과 공식 사이트 링크를 한곳에서 확인하세요.`;
  }
  if (status.id === 'rolling') {
    const rule = group?.rollingRule ?? exam.rollingRule;
    return `${head}는 확정된 연간 시험일이 없는 상시시험입니다.${rule ? ` ${rule}.` : ''} 공식 사이트에서 접수 가능 일자를 확인하세요.`;
  }
  return `${head}의 공식 일정이 아직 발표되지 않았습니다. 기관에 일정이 게시되면 ${SITE_NAME}에도 반영됩니다.`;
}

/**
 * `Event` 구조화 데이터. **확정된 미래 이벤트에만 붙인다.**
 *
 * 과거 일정에까지 붙이지 않는 이유는 검색 결과에 지난 시험일이 뜨는 것을 막기
 * 위해서다. 기간 시행은 `startDate`/`endDate` 를 그대로 준다 — 하루로 줄이면
 * 우리가 날짜를 만든 것이 된다.
 *
 * 경계는 `end >= today` 다. `start >= today` 로 자르면 **진행 중인 시험 기간이
 * 빠진다** — 26일짜리 필기 CBT 가 시작한 다음 날부터 검색 결과에서 사라진다.
 * 지금 치르고 있는 시험이야말로 검색으로 들어오는 사람이 찾는 것이다.
 */
function examJsonLd(
  exam: Exam,
  group: ScheduleGroup | undefined,
  sessions: Session[],
  today: string,
  url: string,
): unknown | undefined {
  const future = sessions
    .filter(s => s.mode !== 'rolling' && s.status !== 'tbd')
    .flatMap(s => s.events)
    .filter(e => e.kind === 'exam' && e.end >= today)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 4);

  if (future.length === 0) return undefined;

  const agency = exam.agency ?? group?.agency;
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${exam.name} 시험 일정`,
    itemListElement: future.map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Event',
        name: `${exam.name} ${e.label}`,
        startDate: e.start,
        endDate: e.end,
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        eventStatus: 'https://schema.org/EventScheduled',
        url,
        ...(agency ? { organizer: { '@type': 'Organization', name: agency } } : {}),
      },
    })),
  };
}

export function headFor(input: HeadInput): HeadMeta {
  const { match, today, origin } = input;
  const year = YEAR_OF(today);

  if (match.id === 'exam') {
    const exam = input.exam;
    const slug = match.params.slug ?? '';
    const canonical = absolute(origin, examPath(slug));

    if (!exam) {
      // 없는 종목을 다른 시험으로 자동 이동시키지 않는다 (§11). 색인도 막는다.
      return {
        title: `시험 정보를 찾을 수 없어요 | ${SITE_NAME}`,
        description: '요청한 시험 정보를 찾지 못했습니다. 전체 시험 목록에서 다시 찾아보세요.',
        canonical: absolute(origin, NOT_FOUND_PATH),
        robots: 'noindex, follow',
      };
    }

    const sessions = input.sessions ?? [];
    const jsonLd = examJsonLd(exam, input.group, sessions, today, canonical);
    return {
      title: `${exam.name} ${year} 시험일정·원서접수 | ${SITE_NAME}`,
      description: examDescription(exam, input.group, sessions, today),
      canonical,
      ...(jsonLd ? { jsonLd } : {}),
    };
  }

  const counts = input.counts;
  const scale = counts ? `${counts.exams}개 시험 · ${counts.groups}개 시행그룹의 ` : '';

  switch (match.id) {
    case 'home':
      return {
        title: `${SITE_NAME} — 흩어진 시험 일정을 한곳에서`,
        description: `${scale}원서접수·시험·발표 일정을 모아 보여줍니다. 로그인 없이 접수 상태를 확인하고 공식 접수처로 바로 이동하세요.`,
        canonical: absolute(origin, ROUTE_PATHS.home),
      };
    case 'exams':
      return {
        title: `시험 일정 찾기 | ${SITE_NAME}`,
        description: `분야·상태·기간으로 ${year}년 자격증과 어학시험 일정을 찾아보세요. 접수 중인 시험과 공식 원서접수 링크를 함께 제공합니다.`,
        // 필터 조합은 canonical 에 넣지 않는다. 무한한 크롤 공간이 된다.
        canonical: absolute(origin, ROUTE_PATHS.exams),
      };
    case 'calendar':
      return {
        title: `시험 일정 캘린더 | ${SITE_NAME}`,
        description: `${year}년 시험의 접수 기간과 시험일을 월간 달력에서 비교하세요. 최대 6개 시험을 한 화면에 올릴 수 있습니다.`,
        canonical: absolute(origin, ROUTE_PATHS.calendar),
      };
    case 'about':
      return {
        title: `서비스 소개와 데이터 출처 | ${SITE_NAME}`,
        description: `${SITE_NAME}는 여러 시행기관의 공개 일정을 정리한 비공식 정보 서비스입니다. 수집 방식과 갱신 주기를 공개합니다.`,
        canonical: absolute(origin, ROUTE_PATHS.about),
      };
    case 'privacy':
      return {
        title: `개인정보와 브라우저 저장 안내 | ${SITE_NAME}`,
        description: '계정을 만들지 않고 개인 프로필을 수집하지 않습니다. 브라우저에 저장되는 값과 삭제 방법을 안내합니다.',
        canonical: absolute(origin, ROUTE_PATHS.privacy),
      };
    default:
      return {
        title: `찾을 수 없는 페이지 | ${SITE_NAME}`,
        description: '요청한 페이지를 찾지 못했습니다. 시험명을 검색하거나 전체 시험 목록을 확인해 주세요.',
        canonical: absolute(origin, NOT_FOUND_PATH),
        robots: 'noindex, follow',
      };
  }
}
