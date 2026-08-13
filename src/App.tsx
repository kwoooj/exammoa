import { useEffect, useRef, useState } from 'react';
import type { Exam, ExamPlan, ExamsFile, GroupsFile, MetaFile, Session, SessionsFile } from './types.ts';
import { dotted, today } from './lib/dates.ts';
import { agoLabel, daysSince, freshnessOf } from './lib/freshness.ts';
import { ddayItems, examOptions, planKey } from './lib/plan.ts';
import { encodePlans, persist, readInitial } from './lib/urlState.ts';
import { ExamPicker, MAX_PICK } from './components/ExamPicker.tsx';
import { PlanCard } from './components/PlanCard.tsx';
import { DDayList } from './components/DDayList.tsx';
import { MonthCalendar } from './components/MonthCalendar.tsx';
import { Timeline } from './components/Timeline.tsx';

type Data = { exams: ExamsFile; groups: GroupsFile; sessions: SessionsFile; meta: MetaFile };

export default function App() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<ExamPlan[]>([]);
  const [query, setQuery] = useState('');
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

  return (
    <main className="wrap">
      <h1>exammoa</h1>
      <p className="lede">
        준비하는 시험을 고르고 응시일을 정하면, 남은 날짜를 가까운 순으로 모아 보여줘요.
      </p>

      {fresh.message && (
        <p className={`notice ${fresh.warn ? 'notice--strong' : ''}`} role="status">
          {fresh.message}
        </p>
      )}

      <h2>다가오는 일정</h2>
      <DDayList items={items} />

      {plans.length > 0 && (
        <>
          <h2>6개월 일정</h2>
          <p className="small muted" style={{ margin: '0 0 12px' }}>
            어느 시기에 몰려 있는지 보는 화면이에요. 한 줄이 시행그룹 하나입니다.
          </p>
          <Timeline plans={plans} sessions={sessions} groups={groups} nameOf={nameOf} today={now} />
        </>
      )}

      {items.length > 0 && (
        <>
          <h2>달력</h2>
          <p className="small muted" style={{ margin: '0 0 12px' }}>
            쓰고 있는 캘린더와 나란히 놓고 보기 위한 화면이에요.
          </p>
          <MonthCalendar items={items} today={now} />
        </>
      )}

      {pickedExams.length > 0 && (
        <>
          <h2>내 시험 {pickedExams.length}개</h2>
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
                onDate={setDate}
                onRemove={toggleExam}
              />
            ))}
          </ul>
        </>
      )}

      <h2>시험 고르기</h2>
      <ExamPicker
        exams={exams}
        categories={categories}
        picked={picked}
        query={query}
        onQuery={setQuery}
        onToggle={toggleExam}
        agencyOf={agencyOf}
      />

      <footer>
        <p>
          {/* 날짜와 (N일 전) 을 붙여 쓰면 안 된다. 앞은 이번 수집 시각, 뒤는 가장 오래된
              소스의 나이라서 "2026.08.13 (219일 전)" 처럼 서로 어긋난다. */}
          최종 확인 {dotted(data.meta.fetchedAt.slice(0, 10))}
          {fresh.worstDays !== null && fresh.worstDays > 0
            ? ` · 가장 오래된 값 ${agoLabel(fresh.worstDays)}`
            : ''} · 종목 {data.meta.examCount}개 · 시행그룹 {data.meta.groupCount}개
        </p>
        {Object.entries(data.meta.sources).map(([id, src]) => (
          <p key={id}>
            {id} · {src.health === 'ok' ? '정상' : src.health === 'stale' ? '이전 값 유지' : '실패'} ·
            마지막 확인 {agoLabel(daysSince(src.fetchedAt, now))}
            {src.reason ? ` — ${src.reason}` : ''}
          </p>
        ))}
        <p>일정은 참고용이며 공식 공고가 우선합니다.</p>
      </footer>
    </main>
  );
}
