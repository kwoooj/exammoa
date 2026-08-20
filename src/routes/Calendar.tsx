/**
 * S-04 통합 캘린더. 화면정의 §8.
 *
 * 두 모드가 한 화면이다 (§8.3):
 *   - **전체 시험** — 필터에 걸리는 공식 일정을 전부 보여준다
 *   - **관심 시험** — 사용자가 별표로 저장한 시험만 보여준다
 *
 * **겹친다고 경고하지 않는다** (§8.11). 실측상 미래 시험이 있는 그룹 조합의 다수가
 * 한 번 이상 겹치는데, 겹침 자체는 응시 불가를 뜻하지 않는다 — 기간 시행이면 다른
 * 날에 보면 된다. 서비스가 대신 판정하는 대신 기간을 나란히 보여주고 사용자가
 * 판단하게 한다.
 */

import { useMemo, useState } from 'react';
import type { AppData } from '../data/index.ts';
import type { EventKind } from '../types.ts';
import { ym } from '../lib/calendar.ts';
import { layoutMonth } from '../lib/monthbars.ts';
import { buildCalendarData } from '../lib/calevents.ts';
import { assignColors } from '../lib/calcolors.ts';
import { parseCalendarQuery, toCalendarSearch } from '../lib/query.ts';
import type { CalendarQuery } from '../lib/query.ts';
import { examPath } from '../lib/routes.ts';
import { useFavorites } from '../lib/favorites.ts';
import { useLocation, useNavigate } from '../router/Router.tsx';
import { ExternalLink, Link } from '../router/Link.tsx';
import { MonthGrid } from '../components/calendar/MonthGrid.tsx';
import type { CalendarSelection } from '../components/calendar/MonthGrid.tsx';
import { CalendarLegend, MonthNav } from '../components/calendar/MonthNav.tsx';
import { ScheduleTable } from '../components/calendar/ScheduleTable.tsx';
import { EventDetail } from '../components/calendar/EventDetail.tsx';
import { X } from '@phosphor-icons/react';

/** 한 주에 그릴 최대 레인. 넘치면 `외 N건` 으로 접는다 (§8.3) */
const LANE_CAP = 3;

/**
 * 기본으로 보여줄 일정 종류.
 *
 * 발표를 뺀다. 실측상 발표가 전체 이벤트의 32%이고 하루짜리 360건 중 258건이라,
 * 켜 두면 달력 절반이 **누르기 전까지 무엇인지 알 수 없는 점**으로 덮인다.
 * 합격발표는 접수·시험과 달리 놓쳐도 되돌릴 수 없는 일이 아니다 — 필요한 사람만
 * 켜면 된다. 없애는 것이 아니라 기본값에서 내리는 것이라 체크 한 번이면 돌아온다.
 */
const DEFAULT_KINDS: EventKind[] = ['reg', 'exam'];

const KINDS: { value: EventKind; label: string }[] = [
  { value: 'reg', label: '접수' },
  { value: 'exam', label: '시험' },
  { value: 'result', label: '발표' },
];

export function Calendar({ data, today }: { data: AppData; today: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { favorites } = useFavorites();
  const [selection, setSelection] = useState<CalendarSelection>(null);

  const { query } = parseCalendarQuery(location.search, {
    categoryIds: data.categories.map(c => c.id),
    slugs: data.exams.map(e => e.slug),
  });
  // 예전 비교 링크(exams=...)도 관심 시험 보기로 자연스럽게 이어 준다.
  const favoriteView = new URLSearchParams(location.search).get('view') === 'favorites'
    || query.exams.length > 0;
  const favoriteSlugs = useMemo(
    () => favorites.filter(slug => data.examBySlug.has(slug)),
    [favorites, data.examBySlug],
  );

  const month = query.month ?? ym(today);

  /**
   * 주소를 바꿀 때 히스토리를 쌓지 않는다. 달을 열 번 넘긴 사람이 뒤로 가기를
   * 열 번 눌러야 원래 있던 화면으로 돌아가면 그것은 되돌아가기가 아니다.
   */
  const viewSearch = (next: CalendarQuery, favoritesOnly = favoriteView) => {
    const params = new URLSearchParams(toCalendarSearch({ ...next, exams: [] }));
    if (favoritesOnly) params.set('view', 'favorites');
    const value = params.toString();
    return value ? `?${value}` : '';
  };

  const update = (next: Partial<CalendarQuery>) => {
    navigate(`/calendar${viewSearch({ ...query, ...next })}`, { replace: true, scroll: false });
    setSelection(null);
  };

  const changeView = (favoritesOnly: boolean) => {
    navigate(`/calendar${viewSearch({ ...query, exams: [] }, favoritesOnly)}`, { replace: true, scroll: false });
    setSelection(null);
  };

  /**
   * 실제로 그릴 종목.
   *
   * 관심 시험 보기면 별표로 저장한 시험만, 전체 시험 보기면 분야 필터에 걸리는
   * 전부를 사용한다. 빈 배열은 전체 일정 모드라는 데이터 계약을 유지한다.
   */
  const effectiveSlugs = useMemo(() => {
    if (favoriteView) {
      return query.category
        ? favoriteSlugs.filter(slug => data.examBySlug.get(slug)?.category === query.category)
        : favoriteSlugs;
    }
    if (query.category) return data.exams.filter(e => e.category === query.category).map(e => e.slug);
    return [];
  }, [favoriteView, favoriteSlugs, query.category, data.examBySlug, data.exams]);
  // buildCalendarData에서 빈 배열은 "전체"다. 관심 시험이 0개일 때만 존재하지 않는
  // slug를 넘겨 전체 일정이 새어 나오지 않게 한다.
  const calendarSlugs = useMemo(
    () => favoriteView && effectiveSlugs.length === 0
      ? ['__no_favorites__']
      : effectiveSlugs,
    [favoriteView, effectiveSlugs],
  );

  /** 주소에 종류가 없으면 기본값을 쓴다. 빈 배열을 '전부' 로 읽지 않는다 */
  const effectiveKinds = query.kinds.length ? query.kinds : DEFAULT_KINDS;

  const calendar = useMemo(
    () => buildCalendarData({
      sessions: data.sessions,
      groups: data.groups,
      exams: data.exams,
      selectedSlugs: calendarSlugs,
      kinds: effectiveKinds,
      links: data.links,
      jmCds: data.jmCds,
    }),
    [data, calendarSlugs, effectiveKinds],
  );

  /**
   * 관심 시험은 즐겨찾기 순서를, 전체 시험은 일정 순서를 사용한다.
   */
  const colorOf = useMemo(() => {
    const ordered = favoriteView
      ? effectiveSlugs.map(s => data.examBySlug.get(s)?.groupId ?? '')
      : calendar.events.map(e => e.groupId);
    return assignColors(ordered.filter(Boolean));
  }, [favoriteView, effectiveSlugs, data.examBySlug, calendar.events]);

  const eventById = useMemo(() => new Map(calendar.events.map(e => [e.id, e])), [calendar.events]);
  const layout = layoutMonth(month, calendar.events, { today, laneCap: LANE_CAP });

  const selectedEvent = selection?.kind === 'bar' ? eventById.get(selection.eventId) : undefined;
  const selectedDate = selection?.kind === 'day' ? selection.date : undefined;
  const dayEvents = selectedDate
    ? calendar.events.filter(e => e.start <= selectedDate && selectedDate <= e.end)
    : [];

  const nameOf = (slug: string) => data.examBySlug.get(slug)?.name ?? slug;

  return (
    <>
      <section className="section section--lead">
        <div className="section__head">
          <h1>시험 일정 캘린더</h1>
        </div>

        <p className="lede">
          {favoriteView
            ? `관심 시험 ${favoriteSlugs.length}개의 접수·시험·발표 일정을 한눈에 봅니다.`
            : '등록된 모든 시험의 공식 일정을 한눈에 봅니다.'}
        </p>

        <div className="calendarViewSwitch" role="group" aria-label="캘린더 보기 범위">
          <button
            type="button"
            className={!favoriteView ? 'calendarViewSwitch__button calendarViewSwitch__button--active' : 'calendarViewSwitch__button'}
            aria-pressed={!favoriteView}
            onClick={() => changeView(false)}
          >
            전체 시험
          </button>
          <button
            type="button"
            className={favoriteView ? 'calendarViewSwitch__button calendarViewSwitch__button--active' : 'calendarViewSwitch__button'}
            aria-pressed={favoriteView}
            onClick={() => changeView(true)}
          >
            관심 시험 <span>{favoriteSlugs.length}</span>
          </button>
        </div>

        <div className="filters">
          <label className="filters__field">
            분야
            <select
              value={query.category ?? ''}
              onChange={e => update({ category: e.target.value || null })}
            >
              <option value="">전체</option>
              {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>

          <fieldset className="filters__kinds">
            <legend className="sr-only">일정 종류</legend>
            {KINDS.map(k => {
              const on = effectiveKinds.includes(k.value);
              return (
                <label key={k.value} className="filters__check">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => {
                      const next = on
                        ? effectiveKinds.filter(v => v !== k.value)
                        : [...effectiveKinds, k.value];
                      // 마지막 하나까지 끄면 빈 달력이 되고 사용자가 이유를 모른다.
                      // 전부 끄려는 조작은 기본값으로 되돌린다.
                      update({ kinds: next.length === 0 ? DEFAULT_KINDS : next });
                    }}
                  />
                  {k.label}
                </label>
              );
            })}
          </fieldset>
        </div>
      </section>

      <section className="section" aria-labelledby="cal-h">
        <div className="section__head">
          <h2 id="cal-h" className="sr-only">월간 일정</h2>
          <MonthNav month={month} today={today} onChange={m => update({ month: m })} />
        </div>

        {favoriteView && favoriteSlugs.length === 0 ? (
          <div className="empty">
            <p>아직 관심 시험이 없어요.</p>
            <p className="small muted">시험 목록에서 별표를 누르면 이 캘린더에 모아 볼 수 있어요.</p>
            <Link to="/exams" className="btn">관심 시험 추가하기</Link>
          </div>
        ) : calendar.events.length === 0 ? (
          <p className="empty">
            {calendar.ruleCards.length > 0
              // 상시시험만 남았으면 빈 격자를 그리지 않는다 (§8.12)
              ? '관심 시험에 확정된 연간 일정이 없어요. 아래 상시시험 규칙을 확인해 주세요.'
              : '조건에 맞는 공식 일정이 없어요. 달을 옮기거나 필터를 줄여 보세요.'}
          </p>
        ) : (
          <div className={selection ? 'callayout callayout--open' : 'callayout'}>
            <div className="callayout__grid">
              <MonthGrid
                layout={layout}
                eventById={eventById}
                today={today}
                selection={selection}
                colorOf={colorOf}
                onSelectDay={date => setSelection({ kind: 'day', date })}
                onSelectBar={eventId => setSelection({ kind: 'bar', eventId })}
              />
              <CalendarLegend />
              {calendar.summarizedGroupIds.length > 0 && (
                <p className="small muted">
                  {/* §8.9 — 고빈도 시험은 기간을 접었다. 어디서 전체를 보는지 말해 준다 */}
                  자주 시행하는 시험은 접수 마감일과 시험일만 표시했어요. 전체 날짜는 아래 일정표에 있어요.
                </p>
              )}
            </div>

            {selection && (
              <div className="callayout__panel">
                <button
                  type="button"
                  className="callayout__close"
                  onClick={() => setSelection(null)}
                  aria-label="상세 닫기"
                >
                  <X size={18} aria-hidden="true" />
                </button>
                <EventDetail
                  event={selectedEvent}
                  dayEvents={dayEvents}
                  date={selectedDate}
                  today={today}
                  nameOf={nameOf}
                />
              </div>
            )}
          </div>
        )}

        <ScheduleTable events={calendar.events} today={today} caption="선택한 조건의 날짜순 일정" />
      </section>

      {/* §8.9 · §7.7 — 상시시험은 막대가 아니라 규칙 카드다 */}
      {calendar.ruleCards.length > 0 && (
        <section className="section" aria-labelledby="rule-h">
          <div className="section__head">
            <h2 id="rule-h">상시시험</h2>
            <p className="section__hint">확정된 연간 시험일이 없어 달력에 그리지 않아요</p>
          </div>
          <ul className="cards">
            {calendar.ruleCards.map(card => (
              <li key={card.groupId} className="rule">
                <p className="rule__name">{card.name}</p>
                <p className="small muted">{card.agency}</p>
                {card.rule && <p className="rule__text">접수 규칙: {card.rule}</p>}
                <p className="row">
                  {card.applyUrl && (
                    <ExternalLink href={card.applyUrl} label={`${card.agency} ${card.name} ${card.applyLabel ?? '원서접수'} 새 창 열기`} className="btn btn--primary">
                      {card.applyLabel ?? '원서접수'}
                    </ExternalLink>
                  )}
                  {card.agencyUrl && (
                    <ExternalLink href={card.agencyUrl} label={`${card.agency} ${card.name} 공식 시험정보 새 창 열기`} className="btn">
                      공식 시험정보
                    </ExternalLink>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 상시시험과 절대 한 통에 담지 않는다 — 뜻이 정반대다 (§7.8) */}
      {calendar.tbdNotices.length > 0 && (
        <section className="section" aria-labelledby="tbd-h">
          <div className="section__head"><h2 id="tbd-h">아직 일정이 발표되지 않은 시험</h2></div>
          <ul className="linklist">
            {calendar.tbdNotices.map(n => (
              <li key={n.groupId}>
                {n.examSlugs.map(slug => (
                  <Link key={slug} to={examPath(slug)}>{nameOf(slug)}</Link>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}

    </>
  );
}

