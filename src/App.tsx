/**
 * 앱 껍데기. 헤더·본문·푸터와 라우트 분기만 한다.
 *
 * 각 화면의 알맹이는 뒤따르는 PR 에서 채운다 (S-03 상세 → S-02 탐색 → S-01 홈 →
 * S-04 통합 캘린더). 지금 여기 있는 것은 **사전 렌더 파이프라인을 끝까지 돌려
 * 보기 위한 최소한**이다 — 라우트마다 진짜 제목과 진짜 데이터 한 줄이 HTML 소스에
 * 박히는지 확인하고 나서 화면을 얹는다.
 */

import { useDataState } from './data/DataContext.tsx';
import { useToday } from './data/TodayContext.tsx';
import { useLocation, useRoute } from './router/Router.tsx';
import { useScrollRestoration } from './router/scroll.ts';
import { useHead } from './router/useHead.ts';
import { headFor } from './lib/head.ts';
import { SiteFooter, SiteHeader } from './components/SiteChrome.tsx';
import { About, Calendar, ExamDetail, Exams, Home, NotFound, Privacy } from './routes/index.tsx';

export default function App() {
  const route = useRoute();
  const location = useLocation();
  const { data, status, error, retry } = useDataState();
  const today = useToday();

  // 목록에 높이가 생긴 뒤에 복원한다. 마운트 시점에는 아직 짧아서 엉뚱한 곳에 선다.
  useScrollRestoration(location.href, data !== null);

  const exam = route.params.slug ? data?.examBySlug.get(route.params.slug) : undefined;
  useHead(headFor({
    match: route,
    today,
    // 클라이언트에서는 지금 보고 있는 주소가 곧 origin 이다.
    origin: typeof window === 'undefined' ? '' : window.location.origin,
    exam,
    group: exam ? data?.groupById.get(exam.groupId) : undefined,
    sessions: exam ? (data?.sessionsByGroup.get(exam.groupId) ?? []) : [],
    ...(data ? { counts: { exams: data.meta.examCount, groups: data.meta.groupCount } } : {}),
  }));

  return (
    <>
      <SiteHeader />
      <main className="wrap" id="main">
        {/*
          §15.3 — 화면 로딩 실패와 수집 실패를 구분한다. 여기는 앞쪽이다.
          수집 실패는 데이터가 멀쩡히 도착한 뒤 meta.sources 로 알려지고, 다시
          시도할 대상이 아니라 푸터와 항목 배지가 말한다.
        */}
        {status === 'error' && !data ? (
          <section className="section">
            <h1>일정을 불러오지 못했어요</h1>
            <p className="lede">{error}</p>
            <button type="button" className="btn btn--primary" onClick={retry}>다시 시도</button>
          </section>
        ) : !data ? (
          // §15.1 — 전체 페이지를 스피너 하나로 막지 않는다. 헤더와 푸터는 이미 위아래에 있다.
          <p className="muted" role="status">불러오는 중…</p>
        ) : route.id === 'home' ? (
          <Home data={data} today={today} />
        ) : route.id === 'exams' ? (
          <Exams data={data} today={today} />
        ) : route.id === 'exam' ? (
          <ExamDetail data={data} today={today} slug={route.params.slug ?? ''} />
        ) : route.id === 'calendar' ? (
          <Calendar data={data} today={today} />
        ) : route.id === 'about' ? (
          <About data={data} today={today} />
        ) : route.id === 'privacy' ? (
          <Privacy />
        ) : (
          <NotFound />
        )}
      </main>
      <SiteFooter />
    </>
  );
}
