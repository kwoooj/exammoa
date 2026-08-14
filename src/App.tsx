import { useEffect, useRef, useState } from 'react';
import type { EventPhase, Exam, ExamPlan, ExamsFile, GroupsFile, MetaFile, Session, SessionsFile } from './types.ts';
import { dotted, today } from './lib/dates.ts';
import { agoLabel, daysSince, freshnessOf } from './lib/freshness.ts';
import { ddayItems, examOptions, planKey } from './lib/plan.ts';
import { encodePlans, persist, readInitial } from './lib/urlState.ts';
import { copyText, planUrl } from './lib/share.ts';
import { AppHeader } from './components/AppHeader.tsx';
import { ExamPicker, MAX_PICK } from './components/ExamPicker.tsx';
import { PlanCard } from './components/PlanCard.tsx';
import { DDaySection } from './components/DDayList.tsx';
import { MonthCalendar } from './components/MonthCalendar.tsx';
import { Timeline } from './components/Timeline.tsx';
import { DatePickSheet, type PickTarget } from './components/DatePickSheet.tsx';
import { WarnIcon } from './components/icons.tsx';

type Data = { exams: ExamsFile; groups: GroupsFile; sessions: SessionsFile; meta: MetaFile };

export default function App() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<ExamPlan[]>([]);
  const [query, setQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickTarget, setPickTarget] = useState<PickTarget | null>(null);
  // id 를 함께 담는다. 같은 문구를 두 번 복사해도 타이머가 다시 돌아야 한다.
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const now = today();

  useEffect(() => {
    Promise.all([
      fetch('/data/exams.json').then(r => r.json()),
      fetch('/data/groups.json').then(r => r.json()),
      fetch('/data/sessions.json').then(r => r.json()),
      fetch('/data/meta.json').then(r => r.json()),
    ])
      .then(([exams, groups, sessions, meta]: [ExamsFile, GroupsFile, SessionsFile, MetaFile]) => {
        const restored = readInitial(exams.exams, sessions.sessions);
        setData({ exams, groups, sessions, meta });
        setPlans(restored);
        // 복원 시점의 인코딩을 기억해 둔다. 이것과 같으면 저장하지 않는다.
        hydrated.current = encodePlans(restored, sessions.sessions);
      })
      .catch(() => setError('데이터를 찾지 못했어요.'));
  }, []);

  /**
   * 복원한 값과 같으면 저장하지 않는다.
   *
   * 이 가드가 없으면 '깨진 링크가 내 저장 상태를 지우는' 일이 생긴다. 남이 보낸
   * `?p=` 가 해석 불가일 때 계획이 빈 배열이 되고, 그것을 localStorage 에 덮어쓰면
   * 원래 저장해 둔 일정이 사라진다. 실제로 브라우저에서 겪어서 넣었다.
   *
   * '첫 실행을 한 번 건너뛴다' 로는 안 된다. StrictMode 가 개발 모드에서 이펙트를
   * 두 번 돌려 건너뛰기가 먼저 소진되고 두 번째 실행이 덮어쓴다. 그래서 횟수가 아니라
   * 값으로 판단한다.
   */
  const hydrated = useRef<string | null>(null);
  useEffect(() => {
    if (!data || hydrated.current === null) return;
    const encoded = encodePlans(plans, data.sessions.sessions);
    if (encoded === hydrated.current) return;
    persist(plans, data.sessions.sessions);
  }, [plans, data]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function copyLink() {
    if (!data) return;
    const ok = await copyText(planUrl(plans, data.sessions.sessions));
    setToast({
      id: Date.now(),
      text: ok ? '링크를 복사했어요' : '복사하지 못했어요. 주소창의 주소를 복사해 주세요',
    });
  }

  if (error) {
    return (
      <main className="wrap">
        <h1>exammoa</h1>
        <p>{error}</p>
        <pre className="small">{`QNET_KEY=... npm run collect
npm run publish:data`}</pre>
      </main>
    );
  }

  if (!data) return <main className="wrap"><p className="muted">불러오는 중…</p></main>;

  const { exams, categories } = data.exams;
  const sessions = data.sessions.sessions;
  const groups = data.groups.groups;

  const examBySlug = new Map(exams.map(e => [e.slug, e]));
  const groupById = new Map(groups.map(g => [g.id, g]));
  const nameOf = (slug: string) => examBySlug.get(slug)?.short ?? examBySlug.get(slug)?.name ?? slug;
  const agencyOf = (e: Exam) => e.agency ?? groupById.get(e.groupId)?.agency;

  const picked = new Set(plans.map(p => p.examSlug));
  const pickedExams = [...picked].map(s => examBySlug.get(s)).filter((e): e is Exam => !!e);

  const fresh = freshnessOf(data.meta, now);
  const items = ddayItems(plans, sessions, nameOf, now);
  const hasPlans = plans.length > 0;

  // ---- 계획 편집 ----

  /** 그 그룹에서 아직 시험이 남은 가장 이른 회차 */
  function defaultSession(groupId: string): Session | undefined {
    return sessions
      .filter(s => s.groupId === groupId && s.mode !== 'rolling' && s.status !== 'tbd')
      .filter(s => s.events.some(e => e.kind === 'exam' && e.end >= now))
      .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))[0];
  }

  /**
   * 회차를 고르면 그 회차의 모든 단계(필기·실기)에 계획을 만든다. 응시일은 비워 둔다.
   * 이렇게 해야 응시일을 정하기 전에도 원서접수 마감 D-Day 를 보여줄 수 있다 —
   * 접수를 놓치면 시험을 아예 못 보므로 그쪽이 더 급한 정보다.
   */
  function plansFor(exam: Exam, session: Session): ExamPlan[] {
    return examOptions(session).map(o => ({
      examSlug: exam.slug,
      groupId: exam.groupId,
      sessionId: session.id,
      phase: o.phase,
    }));
  }

  function toggleExam(slug: string) {
    const exam = examBySlug.get(slug);
    if (!exam) return;
    if (picked.has(slug)) {
      setPlans(ps => ps.filter(p => p.examSlug !== slug));
      return;
    }
    if (picked.size >= MAX_PICK) return;
    // 상시시험은 고를 회차가 없다. 규칙을 보여주기 위해 자리만 만든다.
    const session = exam.rolling ? undefined : defaultSession(exam.groupId);
    setPlans(ps => [
      ...ps,
      ...(session
        ? plansFor(exam, session)
        : [{ examSlug: slug, groupId: exam.groupId, sessionId: '', phase: 'single' as const }]),
    ]);
  }

  function changeSession(slug: string, sessionId: string) {
    const exam = examBySlug.get(slug);
    const session = sessions.find(s => s.id === sessionId);
    if (!exam || !session) return;
    setPlans(ps => [...ps.filter(p => p.examSlug !== slug), ...plansFor(exam, session)]);
  }

  function setDate(key: string, date: string | undefined) {
    setPlans(ps => ps.map(p => (planKey(p) === key ? { ...p, date } : p)));
  }

  /**
   * 계획 하나를 시트가 다룰 형태로 옮긴다.
   *
   * 기간·규칙을 어디서 읽는지는 여기 한 곳에만 둔다. 카드와 타임라인이 각자 계산하면
   * 두 경로가 조용히 어긋난다 — 같은 시험인데 카드에서는 고를 수 있고 타임라인에서는
   * 못 고르는 식이다.
   */
  function pickTargetFor(plan: ExamPlan): PickTarget | null {
    const exam = examBySlug.get(plan.examSlug);
    const examName = exam?.name ?? plan.examSlug;
    const key = planKey(plan);
    const session = sessions.find(s => s.id === plan.sessionId);
    const option = session ? examOptions(session).find(o => o.phase === plan.phase) : undefined;

    if (!option) {
      // 상시시험 — 고를 기간이 없다. 사용자가 예약한 날짜만 받는다.
      const group = exam ? groupById.get(exam.groupId) : undefined;
      return {
        key,
        examName,
        label: '응시일',
        range: null,
        date: plan.date,
        rule: exam?.rollingRule ?? group?.rollingRule ?? null,
      };
    }
    // 하루짜리 시행은 고를 것이 없다. 시트를 열지 않는다.
    if (!option.isRange) return null;
    return { key, examName, label: option.label, range: { start: option.start, end: option.end }, date: plan.date };
  }

  function openPick(plan: ExamPlan) {
    const target = pickTargetFor(plan);
    if (target) setPickTarget(target);
  }

  /** 타임라인 막대에서 열기. 그 그룹·회차·단계에 해당하는 계획을 찾아 같은 시트로 보낸다 */
  function openPickFromBar(groupId: string, sessionId: string, phase: EventPhase) {
    const plan = plans.find(p => p.groupId === groupId && p.sessionId === sessionId && p.phase === phase);
    if (plan) openPick(plan);
  }

  const picker = (
    <ExamPicker
      exams={exams}
      categories={categories}
      picked={picked}
      query={query}
      onQuery={setQuery}
      onToggle={toggleExam}
      agencyOf={agencyOf}
    />
  );

  return (
    <>
      <AppHeader pickedCount={picked.size} onCopy={copyLink} />

      <main className="wrap">
        {fresh.message && (
          <p className="notice" role="status">
            <WarnIcon />
            <span>{fresh.message}</span>
          </p>
        )}

        {/*
          계획이 없을 때는 고르는 것 말고 할 수 있는 일이 없다. 빈 D-Day 상자와 빈
          타임라인을 먼저 보여주고 스크롤 끝에 고르기를 두면, 첫 화면이 "아직 아무것도
          없다" 는 말만 세 번 반복한다. 그래서 순서를 상태에 따라 바꾼다.
        */}
        {!hasPlans ? (
          <>
            <section className="hero">
              {/* 390px 에서 두 줄로 떨어지는 길이여야 한다. 세 줄이 되면 히어로가 무너진다 */}
              <h1>
                준비하는 시험을 고르면<br />
                일정이 한 화면에 모여요
              </h1>
              <p className="lede">
                원서접수 마감과 시험일까지 남은 날짜를 가까운 순으로 모아 보여줘요. 로그인은 없어요.
              </p>
            </section>

            <section className="section" aria-labelledby="pick-h">
              <div className="section__head">
                <h2 id="pick-h">시험 고르기</h2>
                <p className="section__hint">최대 {MAX_PICK}개</p>
              </div>
              {picker}
            </section>
          </>
        ) : (
          <>
            <section className="section section--lead" id="dday" aria-labelledby="dday-h">
              <div className="section__head">
                <h2 id="dday-h">다가오는 일정</h2>
              </div>
              <DDaySection items={items} />
            </section>

            <section className="section" aria-labelledby="tl-h">
              <div className="section__head">
                <h2 id="tl-h">6개월 일정</h2>
                <p className="section__hint">한 줄이 시행그룹 하나예요</p>
              </div>
              <Timeline
                plans={plans}
                sessions={sessions}
                groups={groups}
                nameOf={nameOf}
                today={now}
                onPickBar={openPickFromBar}
              />
            </section>

            {pickedExams.length > 0 && (
              <section className="section" aria-labelledby="my-h">
                <div className="section__head">
                  <h2 id="my-h">내 시험 {pickedExams.length}개</h2>
                  <p className="section__hint">응시일을 정하면 D-Day가 생겨요</p>
                </div>
                <ul className="cards">
                  {pickedExams.map(e => (
                    <PlanCard
                      key={e.slug}
                      exam={e}
                      group={groupById.get(e.groupId)}
                      groupSessions={sessions.filter(s => s.groupId === e.groupId)}
                      allPlans={plans}
                      allSessions={sessions}
                      nameOf={nameOf}
                      today={now}
                      onSession={changeSession}
                      onPick={openPick}
                      onRemove={toggleExam}
                    />
                  ))}
                </ul>
              </section>
            )}

            {items.length > 0 && (
              <details className="fold">
                <summary>달력으로 보기</summary>
                <div className="fold__body">
                  <p className="small muted" style={{ margin: '0 0 12px' }}>
                    쓰고 있는 캘린더와 나란히 놓고 보기 위한 화면이에요.
                  </p>
                  <MonthCalendar items={items} today={now} />
                </div>
              </details>
            )}

            <details
              className="fold"
              open={pickerOpen}
              onToggle={e => setPickerOpen((e.currentTarget as HTMLDetailsElement).open)}
            >
              <summary>시험 더 고르기</summary>
              <div className="fold__body">{picker}</div>
            </details>
          </>
        )}

        <footer>
          <p>
            {/* 날짜와 (N일 전) 을 붙여 쓰면 안 된다. 앞은 이번 수집 시각, 뒤는 가장 오래된
                소스의 나이라서 "2026.08.13 (219일 전)" 처럼 서로 어긋난다. */}
            최종 확인 {dotted(data.meta.fetchedAt.slice(0, 10))}
            {fresh.worstDays !== null && fresh.worstDays > 0
              ? ` · 가장 오래된 값 ${agoLabel(fresh.worstDays)}`
              : ''} · 종목 {data.meta.examCount}개 · 시행그룹 {data.meta.groupCount}개
          </p>
          <p>일정은 참고용이며 공식 공고가 우선합니다.</p>

          {/* 소스별 건강도는 운영자가 보는 값이다. 아홉 줄을 늘 펼쳐 두면 마지막 문단이
              공지가 아니라 로그처럼 읽힌다. 접어 두되 지우지는 않는다 (NFR-REL-01). */}
          <details className="sources">
            <summary>데이터 출처 {Object.keys(data.meta.sources).length}곳</summary>
            {Object.entries(data.meta.sources).map(([id, src]) => (
              <p key={id}>
                {id} · {src.health === 'ok' ? '정상' : src.health === 'stale' ? '이전 값 유지' : '실패'} ·
                마지막 확인 {agoLabel(daysSince(src.fetchedAt, now))}
                {src.reason ? ` — ${src.reason}` : ''}
              </p>
            ))}
          </details>
        </footer>
      </main>

      {/* 고르는 중에는 지금까지 고른 것과 되돌아갈 길이 항상 보여야 한다 */}
      {hasPlans && pickerOpen && (
        <div className="actionbar">
          <div className="actionbar__inner">
            <span className="actionbar__list">
              {pickedExams.map(e => e.short ?? e.name).join(' · ')}
            </span>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                setPickerOpen(false);
                document.getElementById('dday')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              일정 보기
            </button>
          </div>
        </div>
      )}

      <DatePickSheet
        target={pickTarget}
        plans={plans}
        sessions={sessions}
        nameOf={nameOf}
        today={now}
        onSubmit={setDate}
        onClose={() => setPickTarget(null)}
      />

      {toast && (
        <p className="toast" role="status" key={toast.id}>{toast.text}</p>
      )}
    </>
  );
}
