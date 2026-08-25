/**
 * S-03 시험 상세. 화면정의 §7.
 *
 * 검색엔진과 사이트 안 검색으로 들어온 사람에게 **지금 상태 · 회차별 일정 · 공식
 * 출처**를 보여주고 기관으로 내보낸다. §1.2 가 이 화면을 첫 번째 유입 경로로
 * 지목했고, 그래서 사전 렌더가 62개 페이지를 미리 찍는다.
 *
 * 세 갈래가 섞이지 않게 한다:
 *   - 확정 일정이 있다  → 월간 캘린더
 *   - 상시시험(§7.7)    → 규칙 카드. 없는 날짜를 만들지 않는다
 *   - 미공고(§7.8)      → 안내 문구. 빈 표도 비활성 버튼도 두지 않는다
 * 뒤의 둘은 `events` 가 비었다는 것만 같고 뜻이 정반대다.
 */

import { useMemo, useState } from 'react';
import type { AppData } from '../data/index.ts';
import { agencyOf, relatedExams, sessionsOf, siblingsOf } from '../data/index.ts';
import type { Session } from '../types.ts';
import { statusOfExam } from '../lib/status.ts';
import { applyLink, officialLink } from '../lib/links.ts';
import { freshnessOfSource } from '../lib/freshness.ts';
import { addDays, rangeLabel } from '../lib/dates.ts';
import { feeCheckedLabel, feeLabel } from '../lib/fees.ts';
import { activeFormat, countLabel, durationLabel, formatDurationLabel, modeLabel, scoreLabel } from '../lib/exam-details.ts';
import { ym } from '../lib/calendar.ts';
import { layoutMonth } from '../lib/monthbars.ts';
import { buildCalendarData } from '../lib/calevents.ts';
import type { CalendarEvent } from '../lib/calevents.ts';
import { examPath } from '../lib/routes.ts';
import { Link, OfficialLinkButton } from '../router/Link.tsx';
import { MonthGrid } from '../components/calendar/MonthGrid.tsx';
import type { CalendarSelection } from '../components/calendar/MonthGrid.tsx';
import { CalendarLegend, MonthNav } from '../components/calendar/MonthNav.tsx';
import { ScheduleTable } from '../components/calendar/ScheduleTable.tsx';
import { EventDetail } from '../components/calendar/EventDetail.tsx';
import { EventDateTime } from '../components/EventDateTime.tsx';
import { NotFound } from './NotFound.tsx';
import { FavoriteButton } from '../components/FavoriteButton.tsx';
import type { AssessmentFormat, ExamDetail as ExamDetailData } from '../types.ts';

/**
 * 상시시험 규칙을 사람이 확인한 지 이만큼 지나면 "공식 사이트에서 최신 규칙을
 * 확인해 주세요" 를 덧붙인다 (§7.7). 수집 소스의 `staleAfterDays` 와 같은 값이다.
 */
const RULE_STALE_DAYS = 180;

/** 지금 진행 중이거나 가장 가까운 회차. 없으면 마지막 회차 (§7.5) */
function defaultSession(sessions: Session[], today: string): Session | undefined {
  const scheduled = sessions.filter(s => s.mode !== 'rolling' && s.status !== 'tbd' && s.events.length > 0);
  const live = scheduled.find(s => s.events.some(e => e.start <= today && today <= e.end));
  if (live) return live;
  const future = scheduled.find(s => s.events.some(e => e.end >= today));
  // 과거만 남았으면 가장 최근 것을 보여준다. 빈 화면보다 낫다.
  return future ?? scheduled[scheduled.length - 1];
}

export function ExamDetail({ data, today, slug }: { data: AppData; today: string; slug: string }) {
  const exam = data.examBySlug.get(slug);
  const group = exam ? data.groupById.get(exam.groupId) : undefined;
  const sessions = exam ? sessionsOf(data, exam) : [];

  const calendar = useMemo(
    () => (exam
      ? buildCalendarData({
        sessions, groups: data.groups, exams: data.exams, selectedSlugs: [exam.slug],
        links: data.links, jmCds: data.jmCds,
      })
      : null),
    [exam, sessions, data.groups, data.exams, data.links, data.jmCds],
  );

  const initialSession = useMemo(() => defaultSession(sessions, today), [sessions, today]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const chosen = sessionId ?? initialSession?.id ?? null;

  const events = useMemo<CalendarEvent[]>(
    () => (calendar && chosen ? calendar.events.filter(e => e.sessionId === chosen) : []),
    [calendar, chosen],
  );

  const [month, setMonth] = useState<string | null>(null);
  /**
   * 기본 달은 **오늘이 걸쳐 있으면 이번 달**이다.
   *
   * 회차의 첫 이벤트가 있는 달로 열면, 8월 중순에 필기시험이 진행 중인데 7월
   * 접수 달이 열린다 — 사용자가 지금 알아야 할 것은 지나간 접수가 아니라
   * 오늘 벌어지고 있는 일이다.
   */
  const shownMonth = month
    ?? (events.some(e => e.start <= today && today <= e.end) ? ym(today) : ym(events[0]?.start ?? today));

  const [selection, setSelection] = useState<CalendarSelection>(null);

  const eventById = useMemo(() => new Map(events.map(e => [e.id, e])), [events]);

  // 존재하지 않는 시험을 다른 시험으로 자동 이동시키지 않는다 (§11).
  if (!exam || !calendar) return <NotFound />;

  const status = statusOfExam(exam, group, sessions, today);
  const apply = applyLink(exam, group, data.links, data.jmCds);
  const official = officialLink(exam, group, data.links, data.jmCds);
  const src = sessions.find(s => s.src)?.src;
  const fresh = freshnessOfSource(data.meta, src, today);
  const agency = agencyOf(data, exam);
  const siblings = siblingsOf(data, exam);
  const related = relatedExams(data, exam);
  const nameOf = (s: string) => data.examBySlug.get(s)?.name ?? s;
  const fee = feeLabel(exam);
  const feeChecked = feeCheckedLabel(exam);
  const detail = data.detailsBySlug.get(exam.slug);
  const format = detail ? activeFormat(detail.formats, today) : undefined;

  const layout = layoutMonth(shownMonth, events, { today, laneCap: Number.POSITIVE_INFINITY });
  const selectedEvent = selection?.kind === 'bar' ? eventById.get(selection.eventId) : undefined;
  const selectedDate = selection?.kind === 'day' ? selection.date : undefined;
  const dayEvents = selectedDate
    ? events.filter(e => e.start <= selectedDate && selectedDate <= e.end)
    : [];

  const pickable = sessions.filter(s => s.mode !== 'rolling' && s.status !== 'tbd' && s.events.length > 0);

  return (
    <>
      <section className="section section--lead">
        <p className="small muted">
          <Link to="/exams">시험 일정</Link>
          {' › '}
          {data.categoryById.get(exam.category)?.name ?? exam.category}
        </p>
        <div className="detailTitle">
          <h1>{exam.name}</h1>
          <FavoriteButton slug={exam.slug} name={exam.name} />
        </div>
        <p className="small muted">
          {agency}
          {group ? ` · ${group.cadence === 'rolling' ? '상시시험' : group.cadence === 'frequent' ? '고빈도 시행' : '정기시험'}` : ''}
          {' · '}{fresh.label}
        </p>

        {/* 다음 행동과 관련된 대표 이벤트 한 건만 강조한다 (§7.4) */}
        <p className="detail__status">
          <span className={status.emphasis ? 'badge badge--accent' : 'badge'} aria-label={status.a11yLabel}>
            {status.label}
          </span>
          {status.event && (
            <span className="detail__event">
              {status.event.label} · <EventDateTime start={status.event.start} end={status.event.end} timing={status.event.timing} />
            </span>
          )}
        </p>

        <div className="detailFee">
          <span className="detailFee__label">응시료</span>
          <strong>{fee ?? '공식 사이트에서 확인'}</strong>
          {feeChecked && <span className="detailFee__checked">{feeChecked}</span>}
          {exam.fee?.note && <p>{exam.fee.note}</p>}
        </div>

        {/* 공식 CTA 는 데이터가 있을 때만 (§7.4). 모바일에서도 본문 상단에 둔다 (§7.11) */}
        <p className="row">
          <OfficialLinkButton link={apply} className="btn btn--primary" />
          <OfficialLinkButton link={official} className="btn" />
        </p>
        {detail && format && <ExamOverview detail={detail} format={format} />}
        {fresh.failed && (
          <p className="notice" role="status">
            <span>이전에 확인한 정보를 표시하고 있어요. 공식 사이트에서 다시 확인해 주세요.</span>
          </p>
        )}
      </section>

      <section className="section" aria-labelledby="sched-h">
        <div className="section__head">
          <h2 id="sched-h">시험 일정</h2>
          {pickable.length > 1 && (
            <label className="section__hint">
              회차{' '}
              <select
                value={chosen ?? ''}
                onChange={e => { setSessionId(e.target.value); setMonth(null); setSelection(null); }}
                aria-label="회차 선택"
              >
                {pickable.map(s => (
                  <option key={s.id} value={s.id}>{s.label ?? s.id}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {status.id === 'rolling' ? (
          <RuleCard
            rule={group?.rollingRule ?? exam.rollingRule ?? null}
            checkedAt={group?.ruleCheckedAt}
            today={today}
          />
        ) : status.id === 'tbd' ? (
          // 빈 일정표나 비활성 버튼을 보여주지 않는다 (§7.8).
          <p>
            {status.pendingImport
              ? '공식 일정 수집을 연결하고 있어요. 현재 일정은 공식 시험정보에서 확인해 주세요.'
              : `${Number(today.slice(0, 4))}년 일정이 아직 발표되지 않았어요. 공식 기관에 일정이 게시되면 시험모아에도 반영됩니다.`}
          </p>
        ) : (
          <>
            <MonthNav month={shownMonth} today={today} onChange={m => { setMonth(m); setSelection(null); }} />
            <MonthGrid
              layout={layout}
              eventById={eventById}
              today={today}
              selection={selection}
              onSelectDay={date => setSelection({ kind: 'day', date })}
              onSelectBar={eventId => setSelection({ kind: 'bar', eventId })}
              ariaLabel={`${exam.name} 시험 일정`}
            />
            <CalendarLegend />
            <EventDetail
              event={selectedEvent}
              dayEvents={dayEvents}
              date={selectedDate}
              today={today}
              nameOf={nameOf}
            />
            <ScheduleTable events={events} today={today} caption={`${exam.name} 날짜순 일정`} />
          </>
        )}
      </section>

      {detail && format && <ExamComposition detail={detail} format={format} />}

      <section className="section" aria-labelledby="src-h">
        <div className="section__head"><h2 id="src-h">공식 정보</h2></div>
        <p className="small muted">
          출처 {agency}
          {src && data.meta.sources[src] ? ` · 수집 방식 ${methodText(data.meta.sources[src]!.method)}` : ''}
          {' · '}{fresh.label}
        </p>
        <p className="small">일정은 참고용이며 공식 공고가 우선합니다.</p>
        <p className="row"><OfficialLinkButton link={official} className="btn" /></p>
      </section>

      {siblings.length > 0 && (
        <section className="section" aria-labelledby="sib-h">
          <div className="section__head">
            <h2 id="sib-h">일정이 같은 시험</h2>
            <p className="section__hint">같은 시행그룹이라 접수·시험일이 같아요</p>
          </div>
          <ul className="linklist">
            {siblings.slice(0, 8).map(e => (
              <li key={e.slug}><Link to={examPath(e.slug)}>{e.name}</Link></li>
            ))}
          </ul>
        </section>
      )}

      {related.length > 0 && (
        <section className="section" aria-labelledby="rel-h">
          {/* 추천 알고리즘인 척하지 않는다 — 같은 분야에서 골랐을 뿐이다 (§7.10) */}
          <div className="section__head"><h2 id="rel-h">같은 분야의 시험</h2></div>
          <ul className="linklist">
            {related.map(e => (
              <li key={e.slug}><Link to={examPath(e.slug)}>{e.name}</Link></li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function ExamOverview({ detail, format }: { detail: ExamDetailData; format: AssessmentFormat }) {
  const facts = [
    ['분류', detail.classification.label],
    ['결과', detail.result.label],
    ['응시 방식', detail.deliveryModes.join(' · ')],
    ['표준 시험시간', formatDurationLabel(format)],
    ['유효기간', detail.result.validityLabel ?? '공식 안내 없음'],
  ];
  return (
    <div className="detailOverview" aria-labelledby="overview-h">
      <h2 id="overview-h">시험 한눈에</h2>
      <dl className="detailFacts">
        {facts.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
      {detail.result.passCriteria && <p className="detailOverview__criteria"><strong>합격 기준</strong>{detail.result.passCriteria}</p>}
      {detail.result.note && <p className="small muted">{detail.result.note}</p>}
    </div>
  );
}

function ExamComposition({ detail, format }: { detail: ExamDetailData; format: AssessmentFormat }) {
  return (
    <section className="section examComposition" aria-labelledby="composition-h">
      <div className="section__head examComposition__head">
        <div>
          <h2 id="composition-h">시험 구성</h2>
          {format.summary && <p className="section__hint">{format.summary}</p>}
        </div>
        <span className="badge">
          {format.effectiveTo ? `${format.effectiveTo.replaceAll('-', '.')}까지 적용` : '현행 기준'}
        </span>
      </div>

      <div className="examStages">
        {format.stages.map(stage => {
          const sharedDuration = stage.durationMinutes !== undefined;
          const sharedCount = stage.totalItemCount !== undefined
            && stage.sections.every(section => section.itemCount === undefined && section.taskCount === undefined);
          const sharedScore = stage.totalScore !== undefined
            && stage.sections.every(section => section.scoreRange === undefined);
          const showCount = sharedCount || stage.sections.some(section => section.itemCount !== undefined || section.taskCount !== undefined);
          const showDuration = sharedDuration;
          const showMode = stage.sections.some(section => section.mode !== undefined);
          const showScore = sharedScore || stage.sections.some(section => section.scoreRange !== undefined);
          return <article className="examStage" key={stage.id}>
            <div className="examStage__head">
              <h3>{stage.name}</h3>
              {(sharedDuration || sharedCount || sharedScore) && (
                <p className="examStage__sharedMeta">
                  {sharedDuration && <span>전체 시험시간 {durationLabel(stage.durationMinutes)}</span>}
                  {sharedCount && <span>전체 문항 {countLabel(stage.totalItemCount)}</span>}
                  {sharedScore && <span>전체 배점 {stage.totalScore}점</span>}
                </p>
              )}
            </div>
            <table className="formatTable" aria-label={`${stage.name} 구성`}>
              <thead><tr>
                <th>영역·과목</th>
                {showCount && <th>문항·과제</th>}
                {showDuration && <th>시험시간</th>}
                {showMode && <th>방식</th>}
                {showScore && <th>배점</th>}
              </tr></thead>
              <tbody>
                {stage.sections.map((section, index) => (
                  <tr key={section.name}>
                    <td className="formatTable__name"><small>영역·과목</small><strong>{section.name}</strong>{section.note && <em>{section.note}</em>}</td>
                    {showCount && (sharedCount
                      ? index === 0 && <td className="formatTable__sharedCell" rowSpan={stage.sections.length}><small>전체 문항</small><strong>{countLabel(stage.totalItemCount)}</strong></td>
                      : <td><small>문항·과제</small>{countLabel(section.itemCount, section.taskCount)}</td>)}
                    {showDuration && (index === 0
                      ? <td className="formatTable__sharedCell" rowSpan={stage.sections.length}><small>전체 시험시간</small><strong>{durationLabel(stage.durationMinutes)}</strong></td>
                      : null)}
                    {showMode && <td><small>방식</small>{modeLabel(section.mode)}</td>}
                    {showScore && (sharedScore
                      ? index === 0 && <td className="formatTable__sharedCell" rowSpan={stage.sections.length}><small>전체 배점</small><strong>{stage.totalScore}점</strong></td>
                      : <td><small>배점</small>{scoreLabel(section.scoreRange)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            {stage.timedBlocks?.length ? (
              <div className="examStage__timing" aria-label={`${stage.name} 강제 진행 구간`}>
                <strong>진행 구간</strong>
                <ul>
                  {stage.timedBlocks.map(block => (
                    <li key={block.name}>
                      <span>{block.name}</span>
                      <b>{durationLabel(block.durationMinutes)}</b>
                      {block.note && <em>{block.note}</em>}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {stage.note && <p className="small muted examStage__note">{stage.note}</p>}
          </article>;
        })}
      </div>

      {format.note && <p className="notice examComposition__notice">{format.note}</p>}
      <p className="small muted examComposition__source">
        구성 확인 {rangeLabel(format.checkedAt, format.checkedAt)} ·{' '}
        <a href={format.sourceUrl} target="_blank" rel="noreferrer">공식 시험 구성 ↗</a>
        {' · '}분류 출처{' '}
        <a href={detail.classification.sourceUrl} target="_blank" rel="noreferrer">{detail.classification.authority} ↗</a>
      </p>
    </section>
  );
}

function methodText(method: string): string {
  return method === 'api' ? '기관 API'
    : method === 'crawl' ? '공식 페이지 수집'
      : method === 'csv' ? '공개 자료'
        : '수동 확인';
}

/**
 * 상시시험 규칙 카드 (§7.7).
 *
 * **접수 마감을 규칙에서 계산하지 않는다.** "시험일 4일 전까지" 를 날짜로 바꾸는
 * 순간 우리가 날짜를 만든 것이 되고, 틀린 마감일 하나가 시험 하나를 통째로 날린다.
 */
function RuleCard({ rule, checkedAt, today }: { rule: string | null; checkedAt?: string; today: string }) {
  const stale = checkedAt !== undefined && checkedAt < addDays(today, -RULE_STALE_DAYS);
  return (
    <div className="rule">
      <p>확정된 연간 시험일이 없는 상시시험이에요.</p>
      <p className="small muted">접수와 시험 가능 일자는 공식 사이트에서 확인해 주세요.</p>
      {rule && <p className="rule__text">접수 규칙: {rule}</p>}
      {checkedAt && <p className="small muted">마지막 규칙 확인: {rangeLabel(checkedAt, checkedAt)}</p>}
      {stale && <p className="small">공식 사이트에서 최신 규칙을 확인해 주세요.</p>}
    </div>
  );
}

