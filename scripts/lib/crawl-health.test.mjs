import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crawlDiagnosticProblem } from './crawl-health.mjs';
import { mergeStale } from './store.mjs';

test('행 하나의 파싱 실패도 게시를 막는다', () => {
  const problem = crawlDiagnosticProblem({
    headerMatch: true,
    timingMatch: true,
    coverage: { discovered: 1, included: 1, unclassified: [], missing: [] },
    failures: [{ seq: 2, label: '시험일자', reason: 'invalid-date', raw: '미정' }],
  });
  assert.match(problem, /일정 파싱 실패 1건/);
  assert.match(problem, /2회 시험일자/);
});

test('부분 파싱 실패는 직전 성공 데이터를 stale로 계승한다', () => {
  const diagnostics = {
    headerMatch: true,
    coverage: { discovered: 2, included: 2, unclassified: [], missing: [] },
    failures: [{ seq: 2, label: '시험일자', reason: 'invalid-date', raw: '미정' }],
  };
  const error = crawlDiagnosticProblem(diagnostics);
  const previousSession = {
    id: 'sample-2026-2', groupId: 'sample', year: 2026, seq: 2,
    events: [{ kind: 'exam', phase: 'single', start: '2026-05-01', end: '2026-05-01', seq: 1 }],
    src: 'sample-source', conf: 'parsed',
  };
  const merged = mergeStale(
    [{ id: 'sample-source', method: 'crawl', ok: false, sessions: [], error, diagnostics }],
    {
      sessions: { sessions: [previousSession] },
      provenance: { 'sample-2026-2': { src: 'sample-source', hash: 'old', observedAt: '2026-01-01', fetchedAt: '2026-01-02' } },
      meta: { sources: { 'sample-source': { fetchedAt: '2026-01-02' } } },
    },
    { now: '2026-08-20T00:00:00.000Z' },
  );

  assert.equal(merged.sessions.length, 1);
  assert.equal(merged.sessions[0].id, previousSession.id);
  assert.equal(merged.sessions[0].stale, true);
  assert.equal(merged.sessions[0].conf, 'stale');
  assert.equal(merged.sources['sample-source'].health, 'stale');
  assert.equal(merged.sources['sample-source'].fetchedAt, '2026-01-02');
});
