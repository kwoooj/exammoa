// node --test scripts/lib/csv.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeKorean, parseCsv, readCsv } from './csv.mjs';

// ---- 파싱 -------------------------------------------------------------

test('평범한 표', () => {
  assert.deepEqual(parseCsv('a,b\n1,2\n'), [['a', 'b'], ['1', '2']]);
});

test('따옴표 안의 콤마를 쪼개지 않는다 — 실측 함정이다', () => {
  // 시험장소: "제1회 SQLD : (서울)○○대학교, 경영관 3층"
  const rows = parseCsv('회차,시험장소,시험유형\n1,"(서울)○○대학교, 경영관 3층",필기\n');
  assert.equal(rows[1].length, 3, `칸이 밀렸다: ${JSON.stringify(rows[1])}`);
  assert.equal(rows[1][1], '(서울)○○대학교, 경영관 3층');
  assert.equal(rows[1][2], '필기', '마지막 칸에 " 경영관 3층" 이 들어오면 안 된다');
});

test('이중따옴표는 따옴표 하나다', () => {
  assert.deepEqual(parseCsv('a\n"그는 ""좋다"" 고 했다"\n'), [['a'], ['그는 "좋다" 고 했다']]);
});

test('따옴표 안의 줄바꿈은 행을 끝내지 않는다', () => {
  const rows = parseCsv('a,b\n1,"두\n줄"\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[1][1], '두\n줄');
});

test('CRLF 를 처리한다', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]);
});

test('BOM 을 첫 칸 이름에 붙이지 않는다', () => {
  assert.equal(parseCsv('﻿순번,시험명\n1,x\n')[0][0], '순번');
});

test('빈 줄은 행이 아니다', () => {
  assert.deepEqual(parseCsv('a\n1\n\n2\n\n'), [['a'], ['1'], ['2']]);
});

test('마지막 줄에 개행이 없어도 읽는다', () => {
  assert.deepEqual(parseCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
});

test('빈 칸은 빈 문자열로 남는다 — undefined 가 되면 날짜 검사가 통과해 버린다', () => {
  assert.deepEqual(parseCsv('a,b,c\n1,,3\n')[1], ['1', '', '3']);
});

// ---- 인코딩 -----------------------------------------------------------

/** EUC-KR 로 '시험명' */
const EUCKR_HEADER = Buffer.from([0xbc, 0xf8, 0xb9, 0xf8, 0x2c, 0xbd, 0xc3, 0xc7, 0xe8, 0xb8, 0xed]);

test('EUC-KR 을 읽는다 — utf8 로 읽으면 헤더가 깨진다', () => {
  const s = decodeKorean(EUCKR_HEADER, '시험명');
  assert.equal(s, '순번,시험명');
});

test('UTF-8 은 그대로 읽는다', () => {
  const buf = Buffer.from('순번,시험명\n1,SQLD\n', 'utf8');
  assert.match(decodeKorean(buf, '시험명'), /^순번,시험명/);
});

test('expect 가 안 보이면 다른 인코딩으로 재시도한다', () => {
  // 이 바이트열은 유효한 UTF-8 이 아니므로 strict 디코드가 던진다
  assert.equal(decodeKorean(EUCKR_HEADER, '시험명').includes('시험명'), true);
});

test('expect 없이도 동작한다', () => {
  assert.equal(decodeKorean(Buffer.from('a,b', 'utf8')), 'a,b');
});

// ---- 실제 파일 --------------------------------------------------------

test('커밋된 CSV 를 읽는다', async () => {
  const { header, rows, malformed } = await readCsv('data/dataq-2026.csv', { expect: '시험명' });
  assert.equal(malformed, 0, `칸 수가 안 맞는 행이 있다 (${malformed}건) — 파서가 틀렸다`);
  assert.deepEqual(header.slice(0, 3), ['순번', '시험명', '시험구분']);
  assert.equal(header.length, 11);
  assert.ok(rows.length > 900, `실측 947행 (실제 ${rows.length})`);
});

test('시험유형 칸에 장소 조각이 들어오지 않는다 — split(\',\') 로 읽으면 이게 깨진다', async () => {
  const { rows } = await readCsv('data/dataq-2026.csv', { expect: '시험명' });
  const types = new Set(rows.map(r => r['시험유형']));
  assert.deepEqual([...types].sort(), ['실기', '필기'], `오염됨: ${[...types].slice(0, 8).join(' / ')}`);
});

test('시험일이 전부 ISO 다', async () => {
  const { rows } = await readCsv('data/dataq-2026.csv', { expect: '시험명' });
  const bad = rows.filter(r => !/^\d{4}-\d{2}-\d{2}$/.test(r['시험일']));
  assert.equal(bad.length, 0, `ISO 아닌 시험일: ${bad.slice(0, 3).map(r => r['시험일']).join(', ')}`);
});
