/**
 * S-01 홈. 화면정의 §5.
 *
 * 처음 온 사람이 3초 안에 용도를 알고 검색 또는 상태 탐색을 시작하게 한다.
 * 가장 큰 상호작용 요소는 검색창이다 (§5.3-A) — 일러스트도 목업도 두지 않는다.
 *
 * 이번 달 미리보기는 **새 캘린더 코드를 만들지 않는다.** `summarize()` 로 기간을
 * 하루로 줄이고 같은 `layoutMonth` 에 laneCap 2 로 넘긴다 (§5.3-E). 접수는 마감일,
 * 기간 시험은 시작일만 남고 발표는 빠진다.
 */

import { useMemo } from 'react';
import type { AppData } from '../data/index.ts';
import { buildRows, byCategory, openNow, startingSoon } from '../lib/browse.ts';
import { buildCalendarData } from '../lib/calevents.ts';
import { assignColors } from '../lib/calcolors.ts';
import { layoutMonth, summarize } from '../lib/monthbars.ts';
import { ym } from '../lib/calendar.ts';
import { monthLabel } from '../lib/calendar.ts';
import { EMPTY_EXAMS_QUERY, toExamsSearch } from '../lib/query.ts';
import { ROUTE_PATHS, examPath } from '../lib/routes.ts';
import { dotted } from '../lib/dates.ts';
import { Link } from '../router/Link.tsx';
import { useNavigate } from '../router/Router.tsx';
import { SearchBox } from '../components/SearchBox.tsx';
import { ExamRow } from '../components/ExamRow.tsx';
import { MonthGrid } from '../components/calendar/MonthGrid.tsx';

/** 홈 미리보기는 하루 두 건까지만 (§5.3-E) */
const PREVIEW_LANES = 2;

export function Home({ data, today }: { data: AppData; today: string }) {
  const navigate = useNavigate();
  const month = ym(today);

  const rows = useMemo(() => buildRows({ ...data, today }), [data, today]);
  const open = useMemo(() => openNow(rows, 5, 3), [rows]);
  const soon = useMemo(() => startingSoon(rows, 3), [rows]);
  const cats = useMemo(() => byCategory(rows, data.categories, 3), [rows, data.categories]);

  const preview = useMemo(() => {
    const built = buildCalendarData({
      sessions: data.sessions, groups: data.groups, exams: data.exams,
      links: data.links, jmCds: data.jmCds,
    });
    // 발표는 홈에서 뺀다. 접수는 마감일, 기간 시험은 시작일 하루로 줄인다.
    const events = summarize(built.events).map((b, i) => ({ ...built.events[i]!, start: b.start, end: b.end }))
      .filter((_, i) => built.events[i]!.kind !== 'result');
    return { events, byId: new Map(events.map(e => [e.id, e])) };
  }, [data]);

  const layout = layoutMonth(month, preview.events, { today, laneCap: PREVIEW_LANES });
  const colorOf = useMemo(
    () => assignColors(preview.events.map(e => e.groupId)),
    [preview.events],
  );

  const shortcuts = [
    { label: '현재 접수 중', search: toExamsSearch({ ...EMPTY_EXAMS_QUERY, status: 'open' }) },
    { label: '곧 접수 시작', search: toExamsSearch({ ...EMPTY_EXAMS_QUERY, status: 'upcoming' }) },
    { label: '이번 달 시험', search: toExamsSearch({ ...EMPTY_EXAMS_QUERY, month, kinds: ['exam'] }) },
    { label: '상시시험', search: toExamsSearch({ ...EMPTY_EXAMS_QUERY, cadence: 'rolling' }) },
  ];

  const openCount = open.reduce((n, g) => n + g.rows.length + g.more.length, 0);

  return (
    <>
      <section className="hero">
        <h1>흩어진 시험 일정을 한곳에서 확인하세요</h1>
        <p className="lede">
          접수 기간과 시험일을 비교하고 공식 접수처로 바로 이동할 수 있어요.
        </p>
        <SearchBox data={data} today={today} variant="hero" />
        <p className="small muted">로그인 없이 모든 일정을 볼 수 있어요.</p>

        {/* §5.3-B — 최대 네 개. 카테고리 칩을 여기 섞지 않는다 */}
        <nav className="shortcuts" aria-label="상태별 바로가기">
          {shortcuts.map(s => (
            <Link key={s.label} to={`${ROUTE_PATHS.exams}${s.search}`} className="btn">{s.label}</Link>
          ))}
        </nav>
      </section>

      <section className="section" aria-labelledby="open-h">
        <div className="section__head">
          <h2 id="open-h">지금 접수할 수 있는 시험</h2>
          {openCount > 0 && (
            <Link to={`${ROUTE_PATHS.exams}${toExamsSearch({ ...EMPTY_EXAMS_QUERY, status: 'open' })}`}>
              전체 보기
            </Link>
          )}
        </div>

        {openCount === 0 ? (
          // §5.4 — 없으면 없다고 말하고 곧 시작하는 것을 대신 준다
          <div className="empty">
            <p>현재 접수 중인 시험이 없어요.</p>
            {soon.length > 0 && <p className="small muted">곧 접수가 시작되는 시험을 확인해 보세요.</p>}
          </div>
        ) : (
          <ul className="exrows">
            {open.map(g => (
              <li key={g.groupId} className="exgroup">
                <ul className="exrows">
                  {g.rows.map(row => <ExamRow key={row.exam.slug} row={row} />)}
                </ul>
                {g.more.length > 0 && (
                  // §5.3-C — 같은 일정이라 접었다는 것을 밝힌다
                  <p className="small">
                    <Link to={`${ROUTE_PATHS.exams}${toExamsSearch({ ...EMPTY_EXAMS_QUERY, status: 'open', agency: g.rows[0]?.agency ?? null })}`}>
                      같은 일정의 시험 {g.more.length}개 더 보기
                    </Link>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        {openCount === 0 && soon.length > 0 && (
          <ul className="exrows">
            {soon.map(row => <ExamRow key={row.exam.slug} row={row} />)}
          </ul>
        )}
      </section>

      <section className="section" aria-labelledby="cat-h">
        <div className="section__head"><h2 id="cat-h">분야별 시험 찾기</h2></div>
        <ul className="catlist">
          {cats.map(c => (
            <li key={c.category.id} className="catlist__item">
              <Link
                to={`${ROUTE_PATHS.exams}${toExamsSearch({ ...EMPTY_EXAMS_QUERY, category: c.category.id })}`}
                className="catlist__name"
              >
                {c.category.name}
              </Link>
              <span className="small muted">{c.total}개</span>
              {/* 첫 화면에서 62종목을 전부 펼치지 않는다 (§5.3-D) */}
              <p className="small muted catlist__examples">
                {c.rows.map(r => r.exam.name).join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="section" aria-labelledby="prev-h">
        <div className="section__head">
          <h2 id="prev-h">{monthLabel(month)} 주요 일정</h2>
          <Link to={ROUTE_PATHS.calendar}>전체 캘린더</Link>
        </div>
        <MonthGrid
          layout={layout}
          eventById={preview.byId}
          today={today}
          colorOf={colorOf}
          compact
          ariaLabel={`${monthLabel(month)} 주요 일정 미리보기`}
          // 날짜를 누르면 그 달의 통합 캘린더로 넘어간다 (§5.3-E)
          onSelectDay={() => navigate(`${ROUTE_PATHS.calendar}?month=${month}`)}
          onSelectBar={id => {
            const slug = preview.byId.get(id)?.examSlugs[0];
            navigate(slug ? examPath(slug) : `${ROUTE_PATHS.calendar}?month=${month}`);
          }}
        />
        <p className="small muted">
          접수 마감일과 시험 시작일만 요약했어요. 전체 기간은 캘린더에서 볼 수 있어요.
        </p>
      </section>

      <section className="section">
        <p className="small muted">
          시험 {data.meta.examCount}개 · 시행그룹 {data.meta.groupCount}개 · 최종 확인 {dotted(data.buildDate)}
        </p>
        <p className="small"><Link to={ROUTE_PATHS.about}>데이터 출처와 갱신 방식</Link></p>
      </section>
    </>
  );
}
