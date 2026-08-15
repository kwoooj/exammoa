/**
 * 라우터. 라이브러리를 쓰지 않는다.
 *
 * 이유는 취향이 아니라 검증 가능성이다. `node --test` 는 타입만 벗겨 `.ts` 를
 * 직접 돌리므로 **순수 함수만 테스트된다.** 매칭을 `lib/routes.ts` 에 두면 62개
 * 한글 slug 라우팅에 테스트가 붙지만, 라이브러리 내부에 두면 한 줄도 안 붙는다.
 * 여기 남는 것은 배선뿐이라 테스트가 못 닿아도 잃는 것이 적다.
 *
 * 두 번째 이유는 사전 렌더다. 스크립트가 라우트 목록을 **데이터로** 열거해야
 * 하는데(`ROUTE_PATHS`), 라이브러리 설정에서 그것을 뽑아내는 배선은 조용히 어긋난다.
 *
 * `getSnapshot` 이 `window.location.href` 를 **매번 새로 읽는다.** 캐시한 Location
 * 객체를 들고 있으면 외부에서 `history.replaceState` 를 부를 때(예전 계획 저장
 * 코드가 그랬다) 틀린 화면을 그린다. 문자열을 매번 읽으면 최악이 '늦은 렌더' 이지
 * '틀린 렌더' 가 아니다.
 */

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { RouteMatch } from '../lib/routes.ts';
import { matchRoute } from '../lib/routes.ts';

export interface AppLocation {
  href: string;
  pathname: string;
  search: string;
  hash: string;
}

export interface NavigateOptions {
  replace?: boolean;
  /** false 면 스크롤을 건드리지 않는다. 필터 변경처럼 같은 화면을 갱신할 때 쓴다 */
  scroll?: boolean;
}

export type NavigateFn = (to: string, options?: NavigateOptions) => void;

/** pushState 는 이벤트를 만들지 않는다. 우리가 만든다 */
const NAV_EVENT = 'exammoa:navigate';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  window.addEventListener(NAV_EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(NAV_EVENT, onChange);
  };
}

function getSnapshot(): string {
  return window.location.href;
}

function parseHref(href: string): AppLocation {
  // 상대 경로도 받으려면 base 가 필요하다. 사전 렌더에는 location 이 없으므로
  // 넘겨받은 절대 주소를 쓴다.
  const url = new URL(href, 'http://localhost');
  return { href, pathname: url.pathname, search: url.search, hash: url.hash };
}

const LocationContext = createContext<AppLocation | null>(null);
const NavigateContext = createContext<NavigateFn | null>(null);

export function navigate(to: string, options: NavigateOptions = {}): void {
  const { replace = false } = options;
  const current = window.location.href;
  const next = new URL(to, current).href;

  // 같은 주소로의 push 는 히스토리에 쓰레기를 쌓고 뒤로 가기를 망가뜨린다.
  if (next === current && !replace) return;

  if (replace) window.history.replaceState(window.history.state, '', next);
  else window.history.pushState(null, '', next);

  window.dispatchEvent(new Event(NAV_EVENT));
}

export function RouterProvider({ initialHref, children }: { initialHref: string; children: ReactNode }) {
  /**
   * `getServerSnapshot` 이 없으면 `renderToString` 이 던진다. 사전 렌더 단계에서만
   * 드러나는 종류의 실수라 여기 적어 둔다.
   */
  const href = useSyncExternalStore(subscribe, getSnapshot, () => initialHref);
  const location = useMemo(() => parseHref(href), [href]);

  const go = useCallback<NavigateFn>((to, options) => navigate(to, options), []);

  return (
    <LocationContext.Provider value={location}>
      <NavigateContext.Provider value={go}>{children}</NavigateContext.Provider>
    </LocationContext.Provider>
  );
}

export function useLocation(): AppLocation {
  const value = useContext(LocationContext);
  if (!value) throw new Error('RouterProvider 안에서만 쓸 수 있습니다');
  return value;
}

export function useNavigate(): NavigateFn {
  const value = useContext(NavigateContext);
  if (!value) throw new Error('RouterProvider 안에서만 쓸 수 있습니다');
  return value;
}

export function useRoute(): RouteMatch {
  const { pathname } = useLocation();
  return useMemo(() => matchRoute(pathname), [pathname]);
}
