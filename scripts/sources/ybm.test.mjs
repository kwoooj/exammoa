// node --test scripts/sources/ybm.test.mjs — 저장된 실측 HTML 로 돈다

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { splitReg, toeic, toeicSpeaking } from './ybm.mjs';

const fx = async (n) => { try { return await readFile(`build/crawl/${n}.html`, 'utf8'); } catch { return null; } };

test('접수기간 칸을 정기·특별추가로 나눈다', () => {
  const cell = '정기접수 : 2026.06.22 (월) 10:00~2026.07.27 (월) 10:00 특별추가 : 2026.07.29 (수) 10:00~2026.08.03 (월) 10:00';
  const parts = splitReg(cell);
  assert.equal(parts.length, 2);
  assert.equal(parts[0].seq, 1);
  assert.match(parts[0].text, /^2026\.06\.22/);
  assert.ok(!parts[0].text.includes('특별추가'), '정기 구간에 특별추가가 섞였다');
  assert.equal(parts[1].seq, 2);
  assert.match(parts[1].text, /^2026\.07\.29/);
});

test('라벨이 없으면 칸 전체가 하나의 접수기간이다 (토스)', () => {
  const parts = splitReg('2026.06.29 (월) 10:00~2026.07.30 (목) 10:00');
  assert.equal(parts.length, 1);
  assert.equal(parts[0].seq, 1);
});

test('TOEIC — 회차를 뽑고 정기·특별추가를 나눈다', async () => {
  const html = await fx('toeic');
  if (!html) return;
  const { sessions, diagnostics } = toeic.parse(html, { year: 2026 });
  assert.equal(diagnostics.headerMatch, true);
  assert.ok(sessions.length >= 10, `회차가 충분해야 한다 (실제 ${sessions.length})`);

  const s575 = sessions.find(s => s.seq === 575);
  assert.ok(s575, '제575회를 찾지 못했다');
  assert.equal(s575.events.find(e => e.kind === 'exam').start, '2026-08-09');
  assert.equal(s575.events.find(e => e.kind === 'result').start, '2026-08-18');

  const regs = s575.events.filter(e => e.kind === 'reg').sort((a, b) => a.seq - b.seq);
  assert.equal(regs.length, 2, '정기 + 특별추가 두 건이어야 한다');
  assert.deepEqual([regs[0].start, regs[0].end], ['2026-06-22', '2026-07-27']);
  assert.equal(regs[1].seq, 2);
  assert.equal(regs[1].note, '특별추가접수');
});

test('TOEIC — ★ 가 붙은 회차도 읽는다', async () => {
  const html = await fx('toeic');
  if (!html) return;
  const { sessions } = toeic.parse(html, { year: 2026 });
  assert.ok(sessions.some(s => s.seq === 576), '★ 제576회를 놓쳤다');
});

test('TOEIC — 시험은 하루짜리다', async () => {
  const html = await fx('toeic');
  if (!html) return;
  for (const s of toeic.parse(html, { year: 2026 }).sessions) {
    const e = s.events.find(x => x.kind === 'exam');
    assert.equal(e.start, e.end, `${s.label} 시험이 기간으로 잡혔다`);
  }
});

test('TOEIC Speaking — 회차 컬럼이 없어도 시험일 순서로 회차를 만든다', async () => {
  const html = await fx('toeic-speaking');
  if (!html) return;
  const { sessions, diagnostics } = toeicSpeaking.parse(html, { year: 2026 });
  assert.equal(diagnostics.headerMatch, true);
  assert.ok(sessions.length > 0);
  assert.deepEqual(sessions.map(s => s.seq), sessions.map((_, i) => i + 1));
});

test('TOEIC Speaking — 같은 시험일 중복 행을 하나로 접는다', async () => {
  const html = await fx('toeic-speaking');
  if (!html) return;
  const { sessions, diagnostics } = toeicSpeaking.parse(html, { year: 2026 });
  const dates = sessions.map(s => s.events.find(e => e.kind === 'exam').start);
  assert.equal(new Set(dates).size, dates.length, '같은 시험일이 두 회차로 나왔다');
  assert.ok(diagnostics.rows > sessions.length, '중복이 실제로 접혔는지');
});

test('회차가 날짜순으로 정렬된다', async () => {
  for (const [src, name] of [[toeic, 'toeic'], [toeicSpeaking, 'toeic-speaking']]) {
    const html = await fx(name);
    if (!html) continue;
    const dates = src.parse(html, { year: 2026 }).sessions.map(s => s.events.find(e => e.kind === 'exam').start);
    assert.deepEqual(dates, [...dates].sort(), `${name} 정렬이 어긋났다`);
  }
});

test('헤더가 바뀌면 빈 결과 + headerMatch false', () => {
  for (const src of [toeic, toeicSpeaking]) {
    const { sessions, diagnostics } = src.parse('<table><tr><th>x</th></tr></table>', { year: 2026 });
    assert.deepEqual(sessions, []);
    assert.equal(diagnostics.headerMatch, false);
  }
});

test('빈 입력에도 던지지 않는다', () => {
  for (const src of [toeic, toeicSpeaking]) {
    for (const bad of ['', null, undefined]) {
      assert.doesNotThrow(() => src.parse(bad, { year: 2026 }));
    }
  }
});
