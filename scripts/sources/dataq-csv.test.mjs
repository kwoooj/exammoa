// node --test scripts/sources/dataq-csv.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAME_MAP, REQUIRED_GROUPS, collectFile, parseRows } from './dataq-csv.mjs';

/** 실측 행을 그대로 옮긴 것 */
const row = (over = {}) => ({
  순번: '900',
  시험명: '데이터분석 준전문가(ADsP)',
  시험구분: '일반검정',
  회차: '48회',
  시험일: '2026-02-07',
  시험시작시간: '09:00:00',
  접수시작일: '2026-01-05',
  접수마감일: '2026-01-09',
  시험장소: '(서울)○○대학교, 경영관 3층',
  합격자발표일: '2026-03-06',
  시험유형: '필기',
  ...over,
});

const BIGDATA_W = row({ 시험명: '빅데이터분석기사-필기', 회차: '12회', 시험유형: '필기', 시험일: '2026-04-04', 접수시작일: '2026-03-03', 접수마감일: '2026-03-09', 합격자발표일: '2026-04-27' });
const BIGDATA_P = row({ 시험명: '빅데이터분석기사-실기', 회차: '12회', 시험유형: '실기', 시험일: '2026-06-20', 접수시작일: '2026-05-18', 접수마감일: '2026-05-22', 합격자발표일: '2026-07-10' });
const SQLD = row({ 시험명: 'SQL 개발자(SQLD)', 회차: '60회', 시험일: '2026-03-07', 접수시작일: '2026-02-02', 접수마감일: '2026-02-06', 합격자발표일: '2026-03-27' });

const parse = (rows, year = 2026) => parseRows(rows, { year });

// ---- 연도 필터 --------------------------------------------------------

test('해당 연도만 읽는다 — 947행이 2006~2026 을 담고 있다', () => {
  const r = parse([row(), row({ 시험일: '2019-02-07', 회차: '20회' }), row({ 시험일: '2006-03-25', 회차: '1회' })]);
  assert.equal(r.sessions.length, 1);
  assert.equal(r.sessions[0].id, 'kdata-adsp-2026-48');
});

// ---- 이벤트 -----------------------------------------------------------

test('접수·시험·발표가 이벤트가 된다', () => {
  const [s] = parse([row()]).sessions;
  assert.deepEqual(s.events.map(e => [e.kind, e.phase, e.start, e.end]), [
    ['reg', 'single', '2026-01-05', '2026-01-09'],
    ['exam', 'single', '2026-02-07', '2026-02-07'],
    ['result', 'single', '2026-03-06', '2026-03-06'],
  ]);
});

test('단일 단계는 phase 가 single 이다', () => {
  assert.ok(parse([SQLD]).sessions[0].events.every(e => e.phase === 'single'));
});

test('날짜가 ISO 가 아니면 이벤트를 만들지 않고 실패로 센다', () => {
  const r = parse([row({ 합격자발표일: '미정' })]);
  assert.equal(r.sessions[0].events.length, 2, '추측한 날짜를 만들면 안 된다');
  assert.equal(r.diagnostics.failures.length, 1);
  assert.match(r.diagnostics.failures[0].reason, /날짜 형식/);
});

test('빈 날짜는 실패로 세지 않는다 — 아직 공고 안 된 칸이다', () => {
  const r = parse([row({ 합격자발표일: '' })]);
  assert.equal(r.sessions[0].events.length, 2);
  assert.equal(r.diagnostics.failures.length, 0);
});

test('접수 시작·마감 중 하나만 있으면 접수 이벤트를 만들지 않는다', () => {
  const r = parse([row({ 접수마감일: '' })]);
  assert.equal(r.sessions[0].events.filter(e => e.kind === 'reg').length, 0);
  assert.equal(r.diagnostics.failures.length, 1, '한쪽만 있는 것은 이상 신호다');
});

// ---- 빅분기: 필기·실기 합치기 ------------------------------------------

test('같은 회차의 필기·실기 행이 한 회차로 합쳐진다', () => {
  const r = parse([BIGDATA_W, BIGDATA_P]);
  assert.equal(r.sessions.length, 1, '두 회차로 갈리면 타임라인에 같은 종목이 두 줄 나온다');
  const s = r.sessions[0];
  assert.equal(s.id, 'kdata-bigdata-2026-12');
  assert.equal(s.events.length, 6);
  assert.deepEqual(s.events.map(e => `${e.kind}:${e.phase}`), [
    'reg:written', 'exam:written', 'result:written',
    'reg:practical', 'exam:practical', 'result:practical',
  ]);
});

test('이벤트가 날짜순으로 정렬된다', () => {
  // 실기 행을 먼저 줘도 순서가 바뀌지 않아야 한다
  const s = parse([BIGDATA_P, BIGDATA_W]).sessions[0];
  const starts = s.events.map(e => e.start);
  assert.deepEqual(starts, [...starts].sort());
});

test('필기·실기 라벨이 갈린다', () => {
  const s = parse([BIGDATA_W, BIGDATA_P]).sessions[0];
  assert.equal(s.events.find(e => e.kind === 'exam' && e.phase === 'written').label, '필기시험');
  assert.equal(s.events.find(e => e.kind === 'result' && e.phase === 'practical').label, '최종 합격발표');
});

test('회차가 다르면 합치지 않는다', () => {
  const r = parse([BIGDATA_W, { ...BIGDATA_P, 회차: '13회' }]);
  assert.equal(r.sessions.length, 2);
});

// ---- 시험명 매핑 -------------------------------------------------------

test('옛 표기와 새 표기를 모두 같은 그룹으로 읽는다', () => {
  const a = parse([row({ 시험명: 'ADsP(국가공인 데이터분석 준전문가)' })]).sessions[0];
  const b = parse([row({ 시험명: '데이터분석 준전문가(ADsP)' })]).sessions[0];
  assert.equal(a.groupId, b.groupId);
});

test('대상 외 종목은 조용히 넘긴다', () => {
  const r = parse([row({ 시험명: 'SQL 전문가(SQLP)' }), row({ 시험명: '데이터아키텍처 전문가(DAP)' })]);
  assert.equal(r.sessions.length, 0);
  assert.equal(r.diagnostics.ignored, 2);
  assert.equal(r.diagnostics.failures.length, 0, 'seed 에 없는 종목은 실패가 아니다');
});

test('매핑에 없는 새 표기는 실패로 센다 — 조용히 버리면 종목이 사라진다', () => {
  const r = parse([row({ 시험명: '데이터분석 준전문가 (신규표기)' })]);
  assert.equal(r.sessions.length, 0);
  assert.equal(r.diagnostics.ignored, 0);
  assert.equal(r.diagnostics.failures.length, 1);
  assert.match(r.diagnostics.failures[0].reason, /매핑에 없는/);
});

test('회차를 못 읽으면 실패로 센다', () => {
  const r = parse([row({ 회차: '미정' })]);
  assert.equal(r.sessions.length, 0);
  assert.match(r.diagnostics.failures[0].reason, /회차/);
});

// ---- 시험구분 ---------------------------------------------------------

test('특별검정·전환검정은 note 로 남긴다 — 정기 회차와 구분되어야 한다', () => {
  const s = parse([row({ 시험구분: '특별검정' })]).sessions[0];
  assert.ok(s.events.every(e => e.note === '특별검정'));
  assert.equal(parse([row()]).sessions[0].events.every(e => e.note === null), true);
});

// ---- 필수 그룹 --------------------------------------------------------

test('필수 그룹이 비면 missingGroups 에 담긴다', () => {
  const r = parse([row()]); // ADsP 만
  assert.deepEqual(r.diagnostics.missingGroups.sort(), ['kdata-bigdata', 'kdata-sqld']);
});

test('세 그룹이 다 있으면 missingGroups 가 빈다', () => {
  const r = parse([row(), SQLD, BIGDATA_W, BIGDATA_P]);
  assert.deepEqual(r.diagnostics.missingGroups, []);
  assert.equal(r.sessions.length, 3);
});

test('선언한 필수 그룹이 매핑 대상과 일치한다', () => {
  const mapped = new Set(NAME_MAP.values());
  for (const g of REQUIRED_GROUPS) assert.ok(mapped.has(g), `${g} 를 만들 시험명이 없다`);
});

// ---- 실제 파일 --------------------------------------------------------

test('커밋된 CSV 에서 10회차가 나온다', async () => {
  const h = await collectFile({ path: 'data/dataq-2026.csv', year: 2026, observedAt: '2026-01-06T00:00:00.000Z' });
  assert.equal(h.ok, true, h.error ?? '');
  assert.equal(h.sessions.length, 10, 'ADsP 4 · SQLD 4 · 빅분기 2');
  assert.equal(h.observedAt, '2026-01-06T00:00:00.000Z', '오늘로 갱신하면 화면이 방금 확인했다고 거짓말한다');
  assert.equal(h.diagnostics.failures.length, 0, JSON.stringify(h.diagnostics.failures));
  assert.equal(h.diagnostics.malformed, 0);

  const byGroup = {};
  for (const s of h.sessions) byGroup[s.groupId] = (byGroup[s.groupId] ?? 0) + 1;
  assert.deepEqual(byGroup, { 'kdata-adsp': 4, 'kdata-bigdata': 2, 'kdata-sqld': 4 });
});

test('빅분기 실제 회차에 필기·실기가 다 있다', async () => {
  const h = await collectFile({ path: 'data/dataq-2026.csv', year: 2026 });
  for (const s of h.sessions.filter(x => x.groupId === 'kdata-bigdata')) {
    const phases = new Set(s.events.map(e => e.phase));
    assert.deepEqual([...phases].sort(), ['practical', 'written'], s.id);
    assert.equal(s.events.length, 6, s.id);
  }
});

test('파일이 없으면 실패로 돌려준다 — 던지지 않는다', async () => {
  const h = await collectFile({ path: 'data/없는파일.csv', year: 2026 });
  assert.equal(h.ok, false);
  assert.equal(h.sessions.length, 0);
  assert.match(h.error, /읽지 못했다/);
});

test('없는 연도를 요구하면 실패다 — 조용히 0회차를 게시하지 않는다', async () => {
  const h = await collectFile({ path: 'data/dataq-2026.csv', year: 2099 });
  assert.equal(h.ok, false);
  assert.match(h.error, /2099/);
});
