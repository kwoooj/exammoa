/**
 * 경로 매칭. 화면정의 §1 의 정보 구조를 코드로 옮긴 것.
 *
 * 라이브러리 라우터를 쓰지 않고 여기 둔 이유는 **테스트 때문이다.** `node --test`
 * 는 타입만 벗겨 `.ts` 를 직접 돌리므로 순수 함수는 검증되지만 `.tsx` 와 라이브러리
 * 내부는 검증되지 않는다. 62개 한글 slug 라우팅이야말로 검증이 필요한 곳이다.
 * 라우트가 7개, 동적 세그먼트가 1개뿐이라 직접 만드는 편이 싸다.
 *
 * slug 는 한글 그대로다 (`/exam/정보처리기사`). 검색 유입에 유리하고 URL 이 곧
 * 시험 이름이라 공유했을 때 무엇인지 읽힌다. 대신 인코딩 규약을 여기서 한 번만
 * 정한다 — 세 곳에서 각자 `encodeURIComponent` 를 부르면 조용히 어긋난다.
 *
 * **NFC 정규화가 핵심이다.** 같은 '정보처리기사' 라도 조합형(NFD)과 완성형(NFC)은
 * 다른 바이트열이다. macOS 는 파일명을 NFD 로 저장하고 IME 도 NFD 를 낼 수 있는데,
 * 우리 데이터의 slug 는 NFC 다. 정규화하지 않으면 눈에 똑같은 주소가 404 가 된다.
 */

export type RouteId = 'home' | 'exams' | 'exam' | 'calendar' | 'about' | 'privacy' | 'notFound';

export interface RouteMatch {
  id: RouteId;
  /** `exam` 일 때만 slug 가 있다 */
  params: { slug?: string };
  /** 정규화된 경로. 매칭에 쓴 값 그대로 */
  pathname: string;
}

/** 사람이 읽는 라우트 표. 사전 렌더 스크립트가 이것을 열거한다 */
export const ROUTE_PATHS: Record<Exclude<RouteId, 'exam' | 'notFound'>, string> = {
  home: '/',
  exams: '/exams',
  calendar: '/calendar',
  about: '/about',
  privacy: '/privacy',
};

/** 404 는 라우트이면서 파일이기도 하다 (정적 호스트가 이 경로를 쓴다) */
export const NOT_FOUND_PATH = '/404';

const STATIC: ReadonlyMap<string, RouteId> = new Map([
  ...Object.entries(ROUTE_PATHS).map(([id, path]) => [path, id as RouteId] as const),
  [NOT_FOUND_PATH, 'notFound' as RouteId],
]);

/** 한글 slug 를 경로 세그먼트로. 이 함수 밖에서 encodeURIComponent 를 부르지 않는다 */
export function examPath(slug: string): string {
  return `/exam/${encodeURIComponent(slug.normalize('NFC'))}`;
}

/**
 * 경로 세그먼트를 slug 로 되돌린다.
 *
 * 잘못된 퍼센트 시퀀스(`%ZZ`)는 `decodeURIComponent` 가 throw 한다. 사용자가 주소를
 * 손으로 고치다 만든 값이고, 그 하나로 페이지 전체가 죽으면 안 되므로 빈 문자열로
 * 흘려보낸다 — 호출부가 404 로 처리한다.
 */
export function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment).normalize('NFC');
  } catch {
    return '';
  }
}

/**
 * 경로 정규화. 매칭 전에 한 번만 한다.
 *
 * 트레일링 슬래시를 지우는 이유: 정적 호스트가 `/exams` 와 `/exams/` 를 같은
 * 파일로 서빙하는데 라우터만 다르게 보면 한쪽이 404 가 된다. 루트(`/`)는 예외다.
 */
function normalize(pathname: string): string {
  let p = pathname;
  const q = p.search(/[?#]/);
  if (q !== -1) p = p.slice(0, q);
  if (!p.startsWith('/')) p = `/${p}`;
  if (p.length > 1 && p.endsWith('/')) p = p.replace(/\/+$/, '') || '/';
  return p;
}

/**
 * 언제나 무언가를 돌려준다. null 을 돌려주면 호출부마다 404 처리를 다시 쓰게 되고
 * 그중 한 곳이 빠진다.
 */
export function matchRoute(pathname: string): RouteMatch {
  const p = normalize(pathname);

  const staticId = STATIC.get(p);
  if (staticId) return { id: staticId, params: {}, pathname: p };

  if (p.startsWith('/exam/')) {
    const rest = p.slice('/exam/'.length);
    // `/exam/a/b` 는 시험이 아니다. 중첩 경로를 slug 로 삼으면 존재하지 않는
    // 종목에 대해 200 을 주게 되고 검색엔진이 그것을 색인한다.
    if (rest && !rest.includes('/')) {
      const slug = decodeSegment(rest);
      if (slug) return { id: 'exam', params: { slug }, pathname: p };
    }
  }

  return { id: 'notFound', params: {}, pathname: p };
}

/** 우리 사이트 안으로 가는 주소인가. Link 가 클릭을 가로챌지 판단한다 */
export function isInternalHref(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//');
}
