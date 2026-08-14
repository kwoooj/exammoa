// node --test src/data/data.test.ts
//
// 픽스처는 data/published/*.json 의 실측값을 손으로 옮긴 것이다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Category, Exam, MetaFile, ScheduleGroup, Session } from '../types.ts';
import { matchRoute } from '../lib/routes.ts';
import { examPath } from '../lib/routes.ts';
import { DataError, loadRaw, type DataFile, type RawData } from './source.ts';
import { agencyOf, buildAppData, relatedExams, sessionsOf, siblingsOf } from './index.ts';
import { scopeFor, sliceFor } from './slice.ts';

// ---- 픽스처 ------------------------------------------------------------

const exam = (slug: string, name: string, groupId: string, o: Partial<Exam> = {}): Exam => ({
  slug, name, short: null, groupId, jmCd: null, qualgbCd: null, series: null,
  category: 'it', tier: 'T1', priority: 1, ...o,
});

const EXAMS: Exam[] = [
  exam('정보처리기사', '정보처리기사', 'hrdk-regular', { short: '정처기', jmCd: '1320', priority: 1 }),
  exam('산업안전기사', '산업안전기사', 'hrdk-regular', { jmCd: '2290', category: 'safety', priority: 1 }),
  exam('빅데이터분석기사', '빅데이터분석기사', 'kdata-bigdata', { priority: 2 }),
  exam('토익', 'TOEIC', 'toeic', { category: 'lang', agency: 'YBM', priority: 1 }),
  exam('컴퓨터활용능력1급', '컴퓨터활용능력 1급', 'korcham-rolling', { category: 'office', rolling: true }),
];

const GROUPS: ScheduleGroup[] = [
  {
    id: 'hrdk-regular', name: '국가기술자격 정기검정', agency: '한국산업인력공단', cadence: 'periodic',
    // tier X 라 게시 데이터에서 빠진 종목이 섞여 있다 — 실제로 있는 모양이다
    examSlugs: ['정보처리기사', '산업안전기사', '정보보안기사'],
    agencyUrl: 'https://www.q-net.or.kr',
  },
  { id: 'kdata-bigdata', name: '빅데이터분석기사', agency: '한국데이터산업진흥원', cadence: 'periodic', examSlugs: ['빅데이터분석기사'] },
  { id: 'toeic', name: 'TOEIC', agency: 'YBM', cadence: 'frequent', examSlugs: ['토익'] },
  { id: 'korcham-rolling', name: '컴퓨터활용능력', agency: '대한상공회의소', cadence: 'rolling', examSlugs: ['컴퓨터활용능력1급'] },
  // 회차가 0 인 그룹. 실데이터의 kca-security · korcham-acct 가 이 모양이다
  { id: 'kca-security', name: '정보보안기사', agency: '한국방송통신전파진흥원', cadence: 'periodic', examSlugs: ['정보보안기사'] },
];

const session = (id: string, groupId: string, events: Session['events'], o: Partial<Session> = {}): Session => ({
  id, groupId, year: 2026, seq: 1, label: id, mode: 'scheduled', status: 'confirmed', events, ...o,
});

const SESSIONS: Session[] = [
  session('hrdk-regular-2026-3', 'hrdk-regular', [
    { kind: 'reg', phase: 'practical', start: '2026-09-21', end: '2026-10-19', seq: 1, label: '실기 원서접수', note: null },
    { kind: 'exam', phase: 'practical', start: '2026-10-24', end: '2026-11-13', seq: 1, label: '실기시험', note: null },
  ], { seq: 3 }),
  session('hrdk-regular-2026-1', 'hrdk-regular', [
    { kind: 'exam', phase: 'written', start: '2026-02-07', end: '2026-02-20', seq: 1, label: '필기시험', note: null },
  ]),
  session('kdata-bigdata-2026-2', 'kdata-bigdata', [
    { kind: 'exam', phase: 'single', start: '2026-11-28', end: '2026-11-28', seq: 1, label: '시험', note: null },
  ], { seq: 2 }),
  session('toeic-2026-9', 'toeic', [
    { kind: 'exam', phase: 'single', start: '2026-09-13', end: '2026-09-13', seq: 1, label: '시험', note: null },
  ]),
  session('korcham-rolling-2026-rolling', 'korcham-rolling', [], { seq: null, label: null, mode: 'rolling' }),
];

const CATEGORIES: Category[] = [
  { id: 'it', name: 'IT · 개발' },
  { id: 'safety', name: '안전 · 환경 · 품질' },
  { id: 'lang', name: '어학 · 국어 · 한국사' },
  { id: 'office', name: '사무 · 회계' },
];

const META: MetaFile = {
  fetchedAt: '2026-08-14T00:55:45.144Z', year: 2026, examCount: 5, qnetExamCount: 2,
  groupCount: 4, sessionCount: 5, eventCount: 6, tbdCount: 0, staleCount: 0,
  contradictionCount: 0, groupSplitCount: 0, groupSplits: [], sessionsBeforeFold: 8,
  sources: { qnet: { health: 'ok', method: 'api', fetchedAt: '2026-08-14T00:55:45.144Z', sessionCount: 2 } },
  archive: null, notes: [], failed: [],
};

const RAW: RawData = {
  exams: {
    exams: EXAMS,
    categories: CATEGORIES,
    links: { patterns: { qnetDetail: { template: 'https://q-net.example/?jmCd={jmCd}', verified: true } } },
  },
  groups: { year: 2026, groups: GROUPS },
  sessions: { year: 2026, sessions: SESSIONS },
  meta: META,
};

const DATA = buildAppData(RAW);

// ---- loadRaw -----------------------------------------------------------

const readerFor = (files: Partial<Record<DataFile, unknown>>) =>
  async (file: DataFile) => {
    if (!(file in files)) throw new Error('없음');
    return files[file];
  };

test('리더를 주입받아 읽는다 — 공용 코드에 fetch 가 없다', async () => {
  const raw = await loadRaw(readerFor({
    exams: RAW.exams, groups: RAW.groups, sessions: RAW.sessions, meta: RAW.meta,
  }));
  assert.equal(raw.exams.exams.length, 5);
});

test('어느 파일에서 났는지 알려준다', async () => {
  // "데이터를 못 읽었어요" 만으로는 고칠 수 없다.
  await assert.rejects(
    () => loadRaw(readerFor({ exams: RAW.exams, groups: RAW.groups, sessions: RAW.sessions })),
    (e: unknown) => e instanceof DataError && e.file === 'meta',
  );
});

test('다른 모양의 파일을 받으면 거절한다', async () => {
  // 404 페이지의 HTML 이나 캐시가 돌려준 옛 형식을 그대로 통과시키지 않는다.
  await assert.rejects(
    () => loadRaw(readerFor({ exams: { nope: 1 }, groups: RAW.groups, sessions: RAW.sessions, meta: RAW.meta })),
    (e: unknown) => e instanceof DataError && e.file === 'exams',
  );
  await assert.rejects(
    () => loadRaw(readerFor({ exams: RAW.exams, groups: RAW.groups, sessions: RAW.sessions, meta: { nope: 1 } })),
    (e: unknown) => e instanceof DataError && e.file === 'meta',
  );
});

// ---- buildAppData ------------------------------------------------------

test('인덱스를 만든다', () => {
  assert.equal(DATA.examBySlug.get('정보처리기사')?.name, '정보처리기사');
  assert.equal(DATA.groupById.get('toeic')?.agency, 'YBM');
  assert.equal(DATA.categoryById.get('it')?.name, 'IT · 개발');
  assert.equal(DATA.sessionsByGroup.get('hrdk-regular')?.length, 2);
});

test('회차를 첫 이벤트 날짜순으로 정렬한다', () => {
  const list = DATA.sessionsByGroup.get('hrdk-regular')!;
  assert.deepEqual(list.map(s => s.id), ['hrdk-regular-2026-1', 'hrdk-regular-2026-3']);
});

test('이벤트가 없는 회차는 뒤로 간다', () => {
  const list = DATA.sessionsByGroup.get('korcham-rolling')!;
  assert.equal(list.length, 1);
});

test('그룹이 선언했지만 게시되지 않은 종목은 조용히 걸러진다', () => {
  // tier X 종목은 exams.json 에서 빠진다. 실제로 있는 모양이라 죽으면 안 된다.
  assert.deepEqual(DATA.examsByGroup.get('hrdk-regular')!.map(e => e.slug), ['정보처리기사', '산업안전기사']);
  assert.equal(DATA.examBySlug.has('정보보안기사'), false);
});

test('종목이 하나도 없는 그룹도 인덱스를 깨지 않는다', () => {
  assert.equal(DATA.examsByGroup.get('kca-security'), undefined);
  assert.equal(DATA.groupById.get('kca-security')?.agency, '한국방송통신전파진흥원');
});

test('기관 목록은 회차 0 인 그룹까지 담고 가나다순이다', () => {
  // 그 기관의 시험을 찾는 사람이 필터에서 기관을 못 찾으면 없는 서비스처럼 보인다.
  assert.ok(DATA.agencies.includes('한국방송통신전파진흥원'));
  assert.deepEqual([...DATA.agencies].sort((a, b) => a.localeCompare(b, 'ko')), DATA.agencies);
});

test('링크 블록과 화이트리스트를 함께 만든다', () => {
  assert.equal(DATA.links.patterns?.qnetDetail?.verified, true);
  assert.deepEqual([...DATA.jmCds].sort(), ['1320', '2290']);
});

test('빌드 날짜를 산출물에서 뽑는다', () => {
  assert.equal(DATA.buildDate, '2026-08-14');
});

test('검색 색인이 함께 만들어진다', () => {
  assert.equal(DATA.search.length, EXAMS.length);
});

// ---- 조인 --------------------------------------------------------------

test('종목이 기관을 직접 들면 그것이 정본이다', () => {
  assert.equal(agencyOf(DATA, DATA.examBySlug.get('토익')!), 'YBM');
  assert.equal(agencyOf(DATA, DATA.examBySlug.get('정보처리기사')!), '한국산업인력공단');
});

test('그룹을 못 찾는 종목도 살아 있다', () => {
  const 고아 = exam('고아', '고아시험', '없는그룹');
  const d = buildAppData({ ...RAW, exams: { ...RAW.exams, exams: [...EXAMS, 고아] } });
  assert.equal(agencyOf(d, 고아), '');
  assert.deepEqual(sessionsOf(d, 고아), []);
});

test('일정을 함께 쓰는 종목을 자기 자신 빼고 준다', () => {
  const s = siblingsOf(DATA, DATA.examBySlug.get('정보처리기사')!);
  assert.deepEqual(s.map(e => e.slug), ['산업안전기사']);
});

test('관련 시험은 같은 분야에서 자기 자신 빼고 최대 4개', () => {
  const r = relatedExams(DATA, DATA.examBySlug.get('정보처리기사')!);
  assert.deepEqual(r.map(e => e.slug), ['빅데이터분석기사']);
});

// ---- slice -------------------------------------------------------------

const sliceOf = (path: string) => sliceFor(DATA, matchRoute(path));

test('라우트마다 범위가 정해져 있다', () => {
  assert.equal(scopeFor(matchRoute('/')), 'home');
  assert.equal(scopeFor(matchRoute(examPath('정보처리기사'))), 'exam');
  assert.equal(scopeFor(matchRoute('/exams')), 'browse');
  assert.equal(scopeFor(matchRoute('/calendar')), 'browse');
  assert.equal(scopeFor(matchRoute('/about')), 'static');
  assert.equal(scopeFor(matchRoute('/없는경로')), 'static');
});

test('상세 조각은 그 그룹의 회차만 담는다', () => {
  const raw = sliceOf(examPath('정보처리기사'));
  const groupIds = new Set(raw.sessions.sessions.map(s => s.groupId));
  assert.ok(groupIds.has('hrdk-regular'));
  assert.ok(!groupIds.has('toeic'), '다른 분야의 회차가 섞였다');
});

test('상세 조각에 관련 시험과 그 상태 배지에 필요한 회차가 들어 있다', () => {
  const raw = sliceOf(examPath('정보처리기사'));
  const slugs = raw.exams.exams.map(e => e.slug);
  assert.ok(slugs.includes('산업안전기사'), '일정이 같은 시험이 빠졌다');
  assert.ok(slugs.includes('빅데이터분석기사'), '같은 분야 관련 시험이 빠졌다');
  assert.ok(raw.sessions.sessions.some(s => s.groupId === 'kdata-bigdata'), '관련 시험의 회차가 빠졌다');
});

test('조각에 링크 규칙이 함께 간다', () => {
  // 빠지면 사전 렌더한 페이지의 공식 링크가 47종목에서 사라진다.
  for (const path of ['/', '/exams', '/about', examPath('정보처리기사')]) {
    assert.ok(sliceOf(path).exams.links, path);
  }
});

test('없는 종목의 조각도 죽지 않는다', () => {
  const raw = sliceOf(examPath('없는시험'));
  assert.deepEqual(raw.exams.exams, []);
  assert.ok(raw.meta.fetchedAt);
});

test('탐색 조각은 전체 종목을 담되 지난 회차를 뺀다', () => {
  const raw = sliceOf('/exams');
  assert.equal(raw.exams.exams.length, EXAMS.length);
  const ids = raw.sessions.sessions.map(s => s.id);
  assert.ok(!ids.includes('hrdk-regular-2026-1'), '2월에 끝난 회차가 남았다');
  assert.ok(ids.includes('hrdk-regular-2026-3'));
});

test('탐색 조각이 상시 회차를 버리지 않는다', () => {
  // 이벤트가 없다고 빼면 규칙 카드가 사라진다 (CLAUDE.md 규칙 5).
  assert.ok(sliceOf('/exams').sessions.sessions.some(s => s.mode === 'rolling'));
});

test('정적 페이지 조각은 회차를 담지 않는다', () => {
  const raw = sliceOf('/about');
  assert.deepEqual(raw.sessions.sessions, []);
  // 헤더 검색은 살아 있어야 한다
  assert.equal(raw.exams.exams.length, EXAMS.length);
});

test('조각도 buildAppData 를 그대로 통과한다', () => {
  // 같은 인덱싱 코드를 쓴다는 것이 이 설계의 전부다.
  for (const path of ['/', '/exams', '/calendar', '/about', examPath('정보처리기사')]) {
    assert.doesNotThrow(() => buildAppData(sliceOf(path)), path);
  }
});

test('조각이 JSON 으로 왕복한다', () => {
  // 사전 렌더가 이것을 <script type="application/json"> 에 넣는다.
  const raw = sliceOf(examPath('정보처리기사'));
  assert.deepEqual(JSON.parse(JSON.stringify(raw)), raw);
});

test('상세 조각이 전체보다 작다', () => {
  const whole = JSON.stringify(RAW).length;
  const part = JSON.stringify(sliceOf(examPath('토익'))).length;
  assert.ok(part < whole, `조각 ${part} 가 전체 ${whole} 보다 작지 않다`);
});

test('조각은 전체의 부분집합이다', () => {
  // 클라이언트가 전체 데이터로 바꿔 낄 때 이미 그린 것이 다시 쓰이지 않는 근거다.
  const raw = sliceOf('/');
  for (const e of raw.exams.exams) assert.ok(DATA.examBySlug.has(e.slug), e.slug);
  for (const s of raw.sessions.sessions) {
    assert.ok(DATA.sessions.some(x => x.id === s.id), s.id);
  }
});
