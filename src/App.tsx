import { useEffect, useState } from 'react';
import type { ExamsFile, GroupsFile, MetaFile, SessionsFile } from './types';
import { detectConflicts, summarize } from './lib/conflicts';
import { dotted, today } from './lib/dates';
import { agoLabel, daysSince, freshnessOf } from './lib/freshness';

type Data = { exams: ExamsFile; groups: GroupsFile; sessions: SessionsFile; meta: MetaFile };

export default function App() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/data/exams.json').then(r => r.json()),
      fetch('/data/groups.json').then(r => r.json()),
      fetch('/data/sessions.json').then(r => r.json()),
      fetch('/data/meta.json').then(r => r.json()),
    ])
      .then(([exams, groups, sessions, meta]) => setData({ exams, groups, sessions, meta }))
      .catch(() => setError('데이터를 찾지 못했어요.'));
  }, []);

  if (error) {
    return (
      <main>
        <h1>시험 일정 타임라인</h1>
        <p>{error}</p>
        <pre>{`QNET_KEY=... node scripts/collect.mjs
cp -r build public/data     # 또는 build 를 public/data 로 복사`}</pre>
      </main>
    );
  }

  if (!data) return <main><p>불러오는 중…</p></main>;

  const fresh = freshnessOf(data.meta);
  const names = new Map(data.exams.exams.map(e => [e.slug, e.short ?? e.name]));
  const conflicts = detectConflicts(
    data.sessions.sessions,
    data.groups.groups,
    names,
    today(),
  );
  const s = summarize(conflicts);

  return (
    <main>
      <h1>시험 일정 타임라인</h1>

      <p>
        종목 {data.meta.examCount}개 · 시행그룹 {data.meta.groupCount}개 · 회차{' '}
        {data.meta.sessionCount}건 · 이벤트 {data.meta.eventCount}개 · 최종 확인{' '}
        {dotted(data.meta.fetchedAt.slice(0, 10))}
        {' '}({agoLabel(fresh.worstDays)})
      </p>

      {fresh.message && (
        <p role="status">
          {fresh.warn ? '⚠ ' : ''}
          {fresh.message}
        </p>
      )}

      <h2>데이터 출처</h2>
      <ul>
        {Object.entries(data.meta.sources).map(([id, src]) => (
          <li key={id}>
            <strong>{id}</strong> · {src.method} · 회차 {src.sessionCount}건 ·{' '}
            {src.health === 'ok' ? '정상' : src.health === 'stale' ? '이전 값 유지' : '실패'} ·
            마지막 확인 {agoLabel(daysSince(src.fetchedAt))}
            {src.reason ? ` — ${src.reason}` : ''}
          </li>
        ))}
      </ul>
      {data.meta.staleCount > 0 && (
        <p>
          이전에 확인한 값으로 표시 중인 회차 {data.meta.staleCount}건. 공식 공고가 우선합니다.
        </p>
      )}
      <p>
        타임라인의 한 행은 종목이 아니라 <strong>시행그룹</strong>입니다. 종목{' '}
        {data.meta.examCount}개의 일정이 실제로는 {data.meta.groupCount}가지뿐이어서, 종목별로 행을
        그리면 같은 막대가 여러 줄 반복됩니다.
        {/* 접기 전 회차 수는 '이번 실행에서 수집한' 값이다. 소스가 실패해 이전 값을
            계승한 경우 0 이 되므로, sessionCount 와 나란히 놓으면 문장이 거짓이 된다. */}
        {data.meta.sessionsBeforeFold > 0 && (
          <> 이번 수집에서는 {data.meta.sessionsBeforeFold}회차를 받아 {data.meta.sessionCount}건으로
          접었습니다.</>
        )}
      </p>

      {data.meta.groupSplitCount > 0 && (
        <p>
          ⚠ 같은 그룹으로 선언했는데 실측 일정이 갈린 곳 {data.meta.groupSplitCount}건 —
          data/groups.seed.json 을 고쳐야 합니다.
        </p>
      )}

      <h2>충돌 {conflicts.length}건</h2>
      <p>
        불가 {s.blocking} · 주의 {s.warning} · 참고 {s.info}
      </p>
      <ul>
        {conflicts.slice(0, 20).map((c, i) => (
          <li key={i}>
            <strong>{c.level}</strong> {c.message}
          </li>
        ))}
      </ul>

      <footer>
        <p>일정은 참고용이며 공식 공고가 우선합니다.</p>
      </footer>
    </main>
  );
}
