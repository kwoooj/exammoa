// node --test scripts/lib/html.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { followTarget, readTables, rowsAsObjects, tableByHeader } from './html.mjs';

test('단순 표를 격자로 만든다', () => {
  const t = readTables('<table><tr><th>가</th><th>나</th></tr><tr><td>1</td><td>2</td></tr></table>')[0];
  assert.equal(t.grid.length, 2);
  assert.deepEqual(t.grid[0].map(c => c.text), ['가', '나']);
  assert.deepEqual(t.grid[1].map(c => c.text), ['1', '2']);
});

test('caption 을 읽는다', () => {
  const t = readTables('<table><caption>2026년 일정</caption><tr><td>x</td></tr></table>')[0];
  assert.equal(t.caption, '2026년 일정');
});

test('rowspan 을 아래 행으로 펼친다 — 이게 없으면 열이 밀린다', () => {
  // 리눅스마스터 구조: 종목·회차가 1차/2차 하위 행을 관통한다
  const html = `<table>
    <tr><th>종목</th><th>급수</th><th>회차</th><th>차수</th><th>접수</th></tr>
    <tr><td rowspan="2">리눅스마스터</td><td rowspan="2">1급</td><td rowspan="2">2601회</td><td>1차</td><td>01.26~02.06</td></tr>
    <tr><td>2차</td><td>03.20~03.25</td></tr>
  </table>`;
  const t = readTables(html)[0];
  const row2 = t.grid[2].map(c => c.text);
  assert.deepEqual(row2, ['리눅스마스터', '1급', '2601회', '2차', '03.20~03.25'],
    '2차 행에도 종목·급수·회차가 채워져야 한다');
  assert.equal(t.grid[2][0].spanned, true, '펼쳐서 만든 칸은 표시된다');
});

test('colspan 을 옆으로 펼친다', () => {
  const t = readTables('<table><tr><td colspan="3">머리</td></tr><tr><td>a</td><td>b</td><td>c</td></tr></table>')[0];
  assert.equal(t.grid[0].length, 3);
  assert.deepEqual(t.grid[0].map(c => c.text), ['머리', '머리', '머리']);
});

test('닫히지 않은 tr·td 에도 격자를 만든다', () => {
  // kdata 실측: <tr> 이 닫히지 않고 다음 <tr> 이 온다
  const t = readTables('<table><tr><td>1</td><td>2</td><tr><td>3</td><td>4</td></table>')[0];
  assert.equal(t.grid.length, 2);
  assert.deepEqual(t.grid[1].map(c => c.text), ['3', '4']);
});

test('모든 행이 같은 길이다', () => {
  const t = readTables('<table><tr><td>1</td><td>2</td><td>3</td></tr><tr><td>a</td></tr></table>')[0];
  assert.equal(new Set(t.grid.map(r => r.length)).size, 1);
});

test('표가 여러 개면 모두 읽는다', () => {
  assert.equal(readTables('<table><tr><td>1</td></tr></table><table><tr><td>2</td></tr></table>').length, 2);
});

// ---- 헤더로 표 고르기 --------------------------------------------------

const three = `
  <table><caption>안내</caption><tr><th>구분</th><th>내용</th></tr><tr><td>x</td><td>y</td></tr></table>
  <table><tr><th>구분</th><th>원서접수</th><th>취소좌석 접수</th><th>시험일시</th><th>합격자발표</th></tr>
  <tr><td>제77회</td><td>A</td><td>B</td><td>C</td><td>D</td></tr></table>`;

test('인덱스가 아니라 헤더로 고른다', () => {
  const picked = tableByHeader(readTables(three), ['구분', '원서접수', '시험일시', '합격자발표']);
  assert.ok(picked, '찾지 못했다');
  assert.equal(picked.col['원서접수'], 1);
  assert.equal(picked.col['시험일시'], 3);
});

test('헤더 공백 차이를 무시한다', () => {
  const picked = tableByHeader(readTables(three), ['취소좌석접수']);
  assert.equal(picked.col['취소좌석접수'], 2);
});

test('정규식 헤더도 받는다', () => {
  const picked = tableByHeader(readTables(three), [/시험\s*일시/]);
  assert.ok(picked);
});

test('원하는 헤더가 없으면 null — 조용히 다른 표를 읽지 않는다', () => {
  assert.equal(tableByHeader(readTables(three), ['없는헤더']), null);
});

test('헤더 아래 행만 객체로 만든다', () => {
  const picked = tableByHeader(readTables(three), ['구분', '원서접수']);
  const rows = rowsAsObjects(picked);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]['구분'], '제77회');
  assert.equal(rows[0]['원서접수'], 'A');
});

// ---- 이동 대상 --------------------------------------------------------

test('meta refresh 와 frameset', () => {
  assert.equal(
    followTarget('<meta http-equiv="refresh" content="0; url=/main.do">', 'https://www.ihd.or.kr/'),
    'https://www.ihd.or.kr/main.do',
  );
  assert.equal(
    followTarget('<frameset cols="0,100%"><frame name="blank" src="top.htm"><frame name="body" src="/web/home/Default.aspx"></frameset>', 'https://x.kr/'),
    'https://x.kr/web/home/Default.aspx',
  );
  assert.equal(followTarget('<table><tr><td>1</td></tr></table>', 'https://x.kr/'), null);
});

// ---- 실제 픽스처 ------------------------------------------------------

test('한능검 실측 HTML 에서 일정표를 고른다', async () => {
  let html;
  try {
    html = await readFile('build/crawl/history-exam.html', 'utf8');
  } catch {
    return; // 픽스처가 없는 환경에서는 건너뛴다 (build/ 는 git 추적 대상이 아니다)
  }
  const picked = tableByHeader(readTables(html), ['구분', '원서접수', '취소좌석 접수', '시험일시', '합격자발표']);
  assert.ok(picked, '일정표를 찾지 못했다');
  const rows = rowsAsObjects(picked).filter(r => /제\d+회/.test(r['구분']));
  assert.equal(rows.length, 5, `회차가 5개여야 한다 (실제 ${rows.length})`);
  assert.match(rows[0]['구분'], /제77회/);
  assert.match(rows[0]['시험일시'], /2026년 2월 7일/);
});
