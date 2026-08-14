/**
 * S-04 통합 캘린더. 화면정의 §8.
 *
 * 두 모드가 한 화면이다 (§8.3):
 *   - 선택이 없으면 **전체 일정 모드** — 필터에 걸리는 공식 일정을 전부 보여준다
 *   - 1~6개를 고르면 **선택 비교 모드** — 고른 것만 남긴다
 * 비교는 별도의 제품이 아니라 이 화면의 선택 상태다.
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
import { MAX_CALENDAR_EXAMS, parseCalendarQuery, toCalendarSearch } from '../lib/query.ts';
import type { CalendarQuery } from '../lib/query.ts';
import { copyText } from '../lib/share.ts';
import { examPath } from '../lib/routes.ts';
import { useLocation, useNavigate } from '../router/Router.tsx';
import { ExternalLink, Link } from '../router/Link.tsx';
import { MonthGrid } from '../components/calendar/MonthGrid.tsx';
import type { CalendarSelection } from '../components/calendar/MonthGrid.tsx';
import { CalendarLegend, MonthNav } from '../components/calendar/MonthNav.tsx';
import { ScheduleTable } from '../components/calendar/ScheduleTable.tsx';
import { EventDetail } from '../components/calendar/EventDetail.tsx';
import { ExamChips } from '../components/calendar/ExamChips.tsx';

/** 한 주에 그릴 최대 레인. 넘치면 `외 N건` 으로 접는다 (§8.3) */
const LANE_CAP = 3;

const KINDS: { value: EventKind; label: string }[] = [
  { value: 'reg', label: '접수' },
  { value: 'exam', label: '시험' },
  { value: 'result', label: '발표' },
];

export function Calendar({ data, today }: { data: AppData; today: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [selection, setSelection] = useState<CalendarSelection>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { query, missing } = parseCalendarQuery(location.search, {
    categoryIds: data.categories.map(c => c.id),
    slugs: data.exams.map(e => e.slug),
  });

  const month = query.month ?? ym(today);

  /**
   * 주소를 바꿀 때 히스토리를 쌓지 않는다. 달을 열 번 넘긴 사람이 뒤로 가기를
   * 열 번 눌러야 원래 있던 화면으로 돌아가면 그것은 되돌아가기가 아니다.
   */
  const update = (next: Partial<CalendarQuery>) => {
    navigate(`/calendar${toCalendarSearch({ ...query, ...next })}`, { replace: true, scroll: false });
    setSelection(null);
  };

  /**
   * 실제로 그릴 종목.
   *
   * 고른 것이 있으면 그것만. 없으면 분야·기관 필터에 걸리는 전부. 둘 다 없으면
   * 빈 배열을 넘겨 전체 일정 모드가 된다.
   */
  const effectiveSlugs = useMemo(() => {
    if (query.exams.length > 0) return query.exams;
    if (query.category) return data.exams.filter(e => e.category === query.category).map(e => e.slug);
    return [];
  }, [query.exams, query.category, data.exams]);

  const calendar = useMemo(
    () => buildCalendarData({
      sessions: data.sessions,
      groups: data.groups,
      exams: data.exams,
      selectedSlugs: effectiveSlugs,
      kinds: query.kinds,
      links: data.links,
      jmCds: data.jmCds,
    }),
    [data, effectiveSlugs, query.kinds],
  );

  /**
   * 색은 넘겨받은 순서를 따른다. 고른 순서대로 배정해야 칩과 막대가 같은 색이 되고,
   * 시험 하나를 빼도 남은 것들의 색이 갑자기 뒤바뀌지 않는다.
   */
  const colorOf = useMemo(() => {
    const ordered = query.exams.length > 0
      ? query.exams.map(s => data.examBySlug.get(s)?.groupId ?? '')
      : calendar.events.map(e => e.groupId);
    return assignColors(ordered.filter(Boolean));
  }, [query.exams, data.examBySlug, calendar.events]);

  const eventById = useMemo(() => new Map(calendar.events.map(e => [e.id, e])), [calendar.events]);
  const layout = layoutMonth(month, calendar.events, { today, laneCap: LANE_CAP });

  const selectedEvent = selection?.kind === 'bar' ? eventById.get(selection.eventId) : undefined;
  const selectedDate = selection?.kind === 'day' ? selection.date : undefined;
  const dayEvents = selectedDate
    ? calendar.events.filter(e => e.start <= selectedDate && selectedDate <= e.end)
    : [];

  const nameOf = (slug: string) => data.examBySlug.get(slug)?.name ?? slug;
  const compare = query.exams.length > 0;

  async function copyLink() {
    const url = `${window.location.origin}/calendar${toCalendarSearch(query)}`;
    const ok = await copyText(url);
    setToast(ok ? '링크를 복사했어요' : '복사하지 못했어요. 주소창의 주소를 복사해 주세요');
    window.setTimeout(() => setToast(null), 2400);
  }

  return (
    <>
      <section className="section section--lead">
        <div className="section__head">
          <h1>시험 일정 캘린더</h1>
          {/* 두 개 이상 골랐을 때만. 하나짜리 링크는 상세 페이지가 더 낫다 (§8.3) */}
          {query.exams.length >= 2 && (
            <button type="button" className="btn" onClick={copyLink}>링크 복사</button>
          )}
        </div>

        <p className="lede">
          {compare
            ? `고른 시험 ${query.exams.length}개의 접수·시험·발표 일정을 같은 달력에서 봅니다.`
            : '고르지 않아도 전체 공식 일정을 볼 수 있어요. 시험을 담으면 그것만 남습니다.'}
        </p>

        {/* §8.12 — 잘못된 slug 를 조용히 지우지 않는다 */}
        {missing.length > 0 && (
          <p className="notice" role="status">
            <span>
              일부 시험을 찾지 못했어요: {missing.join(', ')}.
              {missing.length > 0 && query.exams.length >= MAX_CALENDAR_EXAMS
                ? ` 한 번에 최대 ${MAX_CALENDAR_EXAMS}개까지 볼 수 있어요.`
                : ''}
            </span>
          </p>
        )}

        <ExamChips
          data={data}
          selected={query.exams}
          colorOf={colorOf}
          onChange={slugs => update({ exams: slugs })}
        />

        <div className="filters">
          <label className="filters__field">
            분야
            <select
              value={query.category ?? ''}
              onChange={e => update({ category: e.target.value || null })}
              disabled={compare}
            >
              <option value="">전체</option>
              {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>

          <fieldset className="filters__kinds">
            <legend className="sr-only">일정 종류</legend>
            {KINDS.map(k => {
              // 아무것도 안 고르면 전부 보여준다. 빈 선택이 "아무것도 안 보임" 이면
              // 사용자가 실수로 화면을 비우고 이유를 모른다.
              const on = query.kinds.length === 0 || query.kinds.includes(k.value);
              return (
                <label key={k.value} className="filters__check">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => {
                      const base = query.kinds.length === 0 ? KINDS.map(x => x.value) : query.kinds;
                      const next = on ? base.filter(v => v !== k.value) : [...base, k.value];
                      update({ kinds: next.length === KINDS.length ? [] : next });
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

        {calendar.events.length === 0 ? (
          <p className="empty">
            {calendar.ruleCards.length > 0
              // 상시시험만 남았으면 빈 격자를 그리지 않는다 (§8.12)
              ? '고른 시험은 확정된 연간 일정이 없는 상시시험이에요. 아래 규칙을 확인해 주세요.'
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
                  ×
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

      {compare && (
        <section className="section">
          <p className="small muted">
            {/* §8.11 — 겹친다고 위험하다고 말하지 않는다 */}
            기간이 겹쳐도 응시가 불가능하다는 뜻은 아니에요. 기간 시행은 그 안에서 날짜를 고를 수 있어요.
          </p>
        </section>
      )}

      {toast && <p className="toast" role="status">{toast}</p>}
    </>
  );
}

