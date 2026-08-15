/**
 * 사전 렌더 진입점. `scripts/prerender.mjs` 가 부른다.
 *
 * `styles.css` 를 import 하지 않는다 — 여기서 부르면 SSR 빌드가 쓸모없는 CSS 자산을
 * 하나 더 뱉는다. 스타일은 `main.tsx` 만 들여온다.
 *
 * 라우트 목록을 **데이터로** 돌려주는 것이 이 파일의 또 다른 일이다. 스크립트가
 * 라우트를 다시 적으면 화면과 사전 렌더 대상이 조용히 어긋나고, 그 어긋남은
 * "그 페이지만 없다" 라서 배포 뒤에야 드러난다.
 */

import { renderToString } from 'react-dom/server';
import App from './App.tsx';
import { DataProvider } from './data/DataContext.tsx';
import { TodayProvider } from './data/TodayContext.tsx';
import { buildAppData } from './data/index.ts';
import type { AppData } from './data/index.ts';
import { sliceFor, scopeFor } from './data/slice.ts';
import type { Scope } from './data/slice.ts';
import { loadRaw } from './data/source.ts';
import type { JsonReader, RawData } from './data/source.ts';
import { RouterProvider } from './router/Router.tsx';
import { NOT_FOUND_PATH, ROUTE_PATHS, examPath, matchRoute } from './lib/routes.ts';
import type { RouteMatch } from './lib/routes.ts';
import { headFor } from './lib/head.ts';
import type { HeadMeta } from './lib/head.ts';

export { buildAppData, loadRaw };
export type { AppData, JsonReader, RawData };

/** 페이지에 심는 봉투. 클라이언트가 이걸로 하이드레이션한다 */
export interface Payload {
  buildDate: string;
  scope: Scope;
  data: RawData;
}

export interface RenderedPage {
  path: string;
  html: string;
  head: HeadMeta;
  payload: Payload;
}

/** 사전 렌더할 경로 전부. 정적 6개 + 종목 수 */
export function collectRoutes(data: AppData): string[] {
  return [
    ...Object.values(ROUTE_PATHS),
    NOT_FOUND_PATH,
    ...data.exams.map(e => examPath(e.slug)),
  ];
}

function headOf(match: RouteMatch, data: AppData, origin: string): HeadMeta {
  const slug = match.params.slug;
  const exam = slug ? data.examBySlug.get(slug) : undefined;
  const group = exam ? data.groupById.get(exam.groupId) : undefined;
  return headFor({
    match,
    today: data.buildDate,
    origin,
    exam,
    group,
    sessions: exam ? (data.sessionsByGroup.get(exam.groupId) ?? []) : [],
    counts: { exams: data.meta.examCount, groups: data.meta.groupCount },
  });
}

export function renderPage(path: string, data: AppData, origin: string): RenderedPage {
  const match = matchRoute(path);
  const slice = sliceFor(data, match);
  const scope = scopeFor(match);

  const html = renderToString(
    <RouterProvider initialHref={`${origin}${path}`}>
      <TodayProvider initial={data.buildDate}>
        {/*
          사전 렌더는 조각만 들고 그린다. 클라이언트도 **정확히 같은 조각**으로
          하이드레이션한 뒤에 전체를 받아 온다 — 그래야 서버가 만든 글자와 첫
          렌더가 한 글자도 다르지 않다.
        */}
        <DataProvider initial={buildAppData(slice)} initialScope={scope} static>
          <App />
        </DataProvider>
      </TodayProvider>
    </RouterProvider>,
  );

  return {
    path,
    html,
    head: headOf(match, data, origin),
    payload: { buildDate: data.buildDate, scope, data: slice },
  };
}
