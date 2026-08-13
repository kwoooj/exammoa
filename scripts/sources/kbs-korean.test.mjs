// node --test scripts/sources/kbs-korean.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EXPECT_HEADERS, parse } from './kbs-korean.mjs';

const fx = async () => { try { return await readFile('build/crawl/kbs-korean.html', 'utf8'); } catch { return null; } };

test('회차를 뽑는다', async () => {
  const html = await fx();
  if (!html) return;
  const { sessions, diagnostics } = parse(html, { year: 2026 });
  assert.equal(diagnostics.headerMatch, true);
  assert.ok(sessions.length >= 4, `실제 ${sessions.length}`);
  assert.equal(sessions[0].seq, 89);
});

test('제89회 날짜가 사이트와 일치한다', async () => {
  const html = await fx();
  if (!html) return;
  const s = parse(html, { year: 2026 }).sessions.find(x => x.seq === 89);
  const pick = (kind, seq = 1) => s.events.find(e => e.kind === kind && e.seq === seq);
  assert.deepEqual([pick('reg').start, pick('reg').end], ['2026-01-05', '2026-02-06']);
  assert.deepEqual([pick('reg', 2).start, pick('reg', 2).end], ['2026-02-07', '2026-02-22']);
  assert.equal(pick('exam').start, '2026-02-28');
  assert.equal(pick('exam').end, '2026-02-28', '시험은 하루짜리다');
  assert.equal(pick('result').start, '2026-03-12');
});

test('추가접수는 seq 2 — 정기 마감과 섞이면 D-Day 가 거짓이 된다', async () => {
  const html = await fx();
  if (!html) return;
  for (const s of parse(html, { year: 2026 }).sessions) {
    const regs = s.events.filter(e => e.kind === 'reg');
    assert.equal(regs.length, 2, `${s.label} 접수가 2건이 아니다`);
    assert.equal(regs.find(r => r.seq === 2).note, '추가접수');
  }
});

test('성적발표는 하루짜리다', async () => {
  const html = await fx();
  if (!html) return;
  for (const s of parse(html, { year: 2026 }).sessions) {
    const r = s.events.find(e => e.kind === 'result');
    if (r) assert.equal(r.start, r.end);
  }
});

test('파싱 실패 0건', async () => {
  const html = await fx();
  if (!html) return;
  assert.deepEqual(parse(html, { year: 2026 }).diagnostics.failures, []);
});

test('헤더가 바뀌면 빈 결과', () => {
  const { sessions, diagnostics } = parse('<table><tr><th>x</th></tr></table>', { year: 2026 });
  assert.deepEqual(sessions, []);
  assert.equal(diagnostics.headerMatch, false);
});

test('기대 헤더가 실측과 같다', () => {
  assert.deepEqual(EXPECT_HEADERS, ['시험회차', '접수기간', '추가 접수기간', '시험일시', '성적발표일']);
});
