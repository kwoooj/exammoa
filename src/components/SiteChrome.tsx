/**
 * 헤더와 푸터. 화면정의 §2.1 · §2.3.
 *
 * 통합 검색과 캘린더 담기 배지는 S-02 를 만드는 PR 에서 붙인다. 지금은 라우트를
 * 오갈 수 있는 최소한만 둔다 — 사전 렌더한 페이지끼리 진짜 `<a href>` 로 이어져
 * 있는지가 이 단계에서 확인할 것이다.
 */

import { useDataState } from '../data/DataContext.tsx';
import { useToday } from '../data/TodayContext.tsx';
import { agoLabel, daysSince, freshnessOf } from '../lib/freshness.ts';
import { dotted } from '../lib/dates.ts';
import { ROUTE_PATHS } from '../lib/routes.ts';
import { Link } from '../router/Link.tsx';

export function SiteHeader() {
  return (
    <header className="hdr">
      <div className="hdr__inner">
        <Link to={ROUTE_PATHS.home} className="hdr__logo">시험모아</Link>
        <nav className="hdr__nav" aria-label="주요 메뉴">
          <Link to={ROUTE_PATHS.exams}>일정 찾기</Link>
          <Link to={ROUTE_PATHS.calendar}>캘린더</Link>
          <Link to={ROUTE_PATHS.about}>소개</Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const { data } = useDataState();
  const today = useToday();
  if (!data) return null;

  const fresh = freshnessOf(data.meta, today);
  const oldest = fresh.worstDays !== null && fresh.worstDays > 0 ? agoLabel(fresh.worstDays) : null;

  return (
    <footer className="wrap">
      <p className="small muted">
        여러 기관의 시험 일정을 모아 보여주는 비공식 정보 서비스입니다.
      </p>
      <p className="small muted">
        {/*
          두 날짜를 붙여 쓰지 않는다. 앞은 이번 수집 시각, 뒤는 가장 오래된 소스의
          나이라서 "2026.08.14 (219일 전)" 처럼 서로 어긋난다.
        */}
        최종 수집 {dotted(data.buildDate)}
        {oldest ? ` · 가장 오래된 값 ${oldest}` : ''}
        {' · '}
        {/* 시행그룹 수는 meta 를 쓴다. groups.length 에는 일정이 없는 그룹까지 들어 있다 */}
        시험 {data.meta.examCount}개 · 시행그룹 {data.meta.groupCount}개
      </p>
      <p className="small muted">일정은 참고용이며 공식 공고가 우선합니다.</p>
      <p className="small">
        <Link to={ROUTE_PATHS.about}>데이터 출처</Link>
        {' · '}
        <Link to={ROUTE_PATHS.privacy}>개인정보</Link>
      </p>
      {/*
        소스별 건강도는 운영자가 보는 값이다. 아홉 줄을 늘 펼쳐 두면 마지막 문단이
        공지가 아니라 로그처럼 읽힌다. 접어 두되 지우지는 않는다 (§2.3).
      */}
      <details className="sources">
        <summary className="small">데이터 출처 {Object.keys(data.meta.sources).length}곳</summary>
        {Object.entries(data.meta.sources).map(([id, src]) => (
          <p key={id} className="small muted">
            {id} · {src.health === 'ok' ? '정상' : src.health === 'stale' ? '이전 값 유지' : '실패'}
            {' · '}마지막 확인 {agoLabel(daysSince(src.fetchedAt, today))}
            {src.reason ? ` — ${src.reason}` : ''}
          </p>
        ))}
      </details>
    </footer>
  );
}
