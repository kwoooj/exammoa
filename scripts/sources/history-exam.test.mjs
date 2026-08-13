// node --test scripts/sources/history-exam.test.mjs
// 저장된 실측 HTML 로 돈다. 네트워크를 타지 않는다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EXPECT_HEADERS, parse } from './history-exam.mjs';

const fixture = async () => {
  try {
    return await readFile('build/crawl/history-exam.html', 'utf8');
  } catch {
    return null;
  }
};

test('실측 HTML 에서 5회차를 뽑는다', async () => {
  const html = await fixture();
  if (!html) return;
  const { sessions, diagnostics } = parse(html, { year: 2026 });
  assert.equal(diagnostics.headerMatch, true);
  assert.equal(sessions.length, 5, `회차 5개여야 한다 (실제 ${sessions.length})`);
  assert.deepEqual(sessions.map(s => s.seq), [77, 78, 79, 80, 81]);
});

test('파싱 실패가 0건이다', async () => {
  const html = await fixture();
  if (!html) return;
  const { diagnostics } = parse(html, { year: 2026 });
  assert.deepEqual(diagnostics.failures, [], '실패가 있으면 표기 형식이 바뀐 것이다');
});

test('제77회 날짜가 사이트와 일치한다', async () => {
  const html = await fixture();
  if (!html) return;
  const s = parse(html, { year: 2026 }).sessions.find(x => x.seq === 77);
  const pick = (kind, seq = 1) => s.events.find(e => e.kind === kind && e.seq === seq);
  assert.deepEqual([pick('reg').start, pick('reg').end], ['2026-01-06', '2026-01-13']);
  assert.deepEqual([pick('reg', 2).start, pick('reg', 2).end], ['2026-01-20', '2026-01-23']);
  assert.equal(pick('exam').start, '2026-02-07');
  assert.equal(pick('exam').end, '2026-02-07', '시험은 하루짜리다');
  assert.equal(pick('result').start, '2026-02-20');
});

test('취소좌석 접수는 seq 2 다 — 정기접수 마감과 구분되어야 한다', async () => {
  const html = await fixture();
  if (!html) return;
  const s = parse(html, { year: 2026 }).sessions[0];
  const regs = s.events.filter(e => e.kind === 'reg');
  assert.equal(regs.length, 2);
  assert.deepEqual(regs.map(e => e.seq), [1, 2]);
  assert.equal(regs[1].note, '취소좌석접수');
});

test('phase 는 전부 single 이다 — 한능검은 필기·실기 구분이 없다', async () => {
  const html = await fixture();
  if (!html) return;
  const { sessions } = parse(html, { year: 2026 });
  for (const s of sessions) for (const e of s.events) assert.equal(e.phase, 'single');
});

test('이벤트가 날짜순으로 정렬된다', async () => {
  const html = await fixture();
  if (!html) return;
  for (const s of parse(html, { year: 2026 }).sessions) {
    const dates = s.events.map(e => e.start);
    assert.deepEqual(dates, [...dates].sort(), `${s.label} 정렬이 어긋났다`);
  }
});

test('헤더가 바뀌면 조용히 다른 표를 읽지 않고 빈 결과를 낸다', () => {
  const { sessions, diagnostics } = parse('<table><tr><th>가</th></tr><tr><td>1</td></tr></table>', { year: 2026 });
  assert.deepEqual(sessions, []);
  assert.equal(diagnostics.headerMatch, false);
});

test('빈 입력에도 던지지 않는다', () => {
  for (const bad of ['', null, undefined, '<html></html>']) {
    assert.doesNotThrow(() => parse(bad, { year: 2026 }));
  }
});

test('기대 헤더가 실측 표와 같다', () => {
  assert.deepEqual(EXPECT_HEADERS, ['구분', '원서접수', '취소좌석 접수', '시험일시', '합격자발표']);
});
