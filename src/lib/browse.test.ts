// node --test src/lib/browse.test.ts
//
// 픽스처는 data/published/*.json 의 실측값을 손으로 옮긴 것이다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Category, Exam, LinksFile, MetaFile, ScheduleGroup, Session } from '../types.ts';
import { buildRows, byCategory, filterRows, openNow, sortRows, startingSoon } from './browse.ts';
import type { BrowseInput } from './browse.ts';
import { EMPTY_EXAMS_QUERY } from './query.ts';
import { buildSearchIndex } from './search.ts';
import { jmCdWhitelist } from './links.ts';

const TODAY = '2026-08-14';

// ---- 픽스처 ------------------------------------------------------------

const exam = (slug: string, name: string, groupId: string, o: Partial<Exam> = {}): Exam => ({
  slug, name, short: null, groupId, jmCd: null, qualgbCd: null, series: null,
  category: 'it', tier: 'T1', priority: 1, ...o,
});

const session = (id: string, groupId: string, events: Session['events'], o: Partial<Session> = {}): Session => ({
  id, groupId, year: 2026, seq: 1, label: id, mode: 'scheduled', status: 'confirmed', events,
  src: 'qnet', conf: 'verified', ...o,
});

const ev = (kind: 'reg' | 'exam' | 'result', start: string, end: string, label: string, seq = 1) =>
  ({ kind, phase: 'single' as const, start, end, seq, label, note: null });

/** 같은 그룹에 종목이 여럿 — 실측상 hrdk-regular 에 29종목이 붙어 있다 */
const 기사종목 = ['정보처리기사', '산업안전기사', '건설안전기사', '화학분석기사', '전기기사']
  .map((n, i) => exam(n, n, 'hrdk-regular', { priority: i + 1, jmCd: `13${20 + i}` }));

const EXAMS: Exam[] = [
  ...기사종목,
  exam('SQLD', 'SQL 개발자(SQLD)', 'kdata-sqld', { short: 'SQLD', priority: 1 }),
  exam('토익', 'TOEIC', 'toeic', { category: 'lang', agency: 'YBM', priority: 1 }),
  exam('컴퓨터활용능력1급', '컴퓨터활용능력 1급', 'korcham-rolling', { category: 'office', rolling: true, priority: 1 }),
  exam('정보보안기사', '정보보안기사', 'kca-security', { priority: 4 }),
];

const GROUPS: ScheduleGroup[] = [
  { id: 'hrdk-regular', name: '국가기술자격 정기검정', agency: '한국산업인력공단', cadence: 'periodic', examSlugs: 기사종목.map(e => e.slug) },
  { id: 'kdata-sqld', name: 'SQLD', agency: '한국데이터산업진흥원', cadence: 'periodic', examSlugs: ['SQLD'], agencyUrl: 'https://dataq.example' },
  { id: 'toeic', name: 'TOEIC', agency: 'YBM', cadence: 'frequent', examSlugs: ['토익'], agencyUrl: 'https://toeic.example' },
  {
    id: 'korcham-rolling', name: '컴퓨터활용능력', agency: '대한상공회의소', cadence: 'rolling',
    rollingRule: '상시시험', examSlugs: ['컴퓨터활용능력1급'],
    // 실측: 이 그룹만 종목별 접수 주소를 갖는다
    agencyUrl: 'https://license.korcham.net',
    applyUrl: 'https://license.korcham.net/ex/dailyExam_join.do',
  },
  { id: 'kca-security', name: '정보보안기사', agency: '한국방송통신전파진흥원', cadence: 'periodic', examSlugs: ['정보보안기사'] },
];

const SESSIONS: Session[] = [
  // 접수 진행 중, 8/24 마감 → reg-open
  session('hrdk-regular-2026-3', 'hrdk-regular', [
    ev('reg', '2026-08-10', '2026-08-24', '실기 원서접수'),
    ev('exam', '2026-10-24', '2026-11-13', '실기시험'),
  ]),
  // 접수 D-2 → reg-closing
  session('kdata-sqld-2026-3', 'kdata-sqld', [
    ev('reg', '2026-08-08', '2026-08-16', '원서접수'),
    ev('exam', '2026-09-12', '2026-09-12', '시험'),
  ]),
  // 접수 예정
  session('toeic-2026-9', 'toeic', [
    ev('reg', '2026-09-01', '2026-09-10', '정기접수'),
    ev('exam', '2026-09-20', '2026-09-20', '시험'),
  ]),
  session('korcham-rolling-2026-rolling', 'korcham-rolling', [], { seq: null, label: null, mode: 'rolling', src: 'rolling-rules' }),
];

const CATEGORIES: Category[] = [
  { id: 'it', name: 'IT · 개발' },
  { id: 'lang', name: '어학 · 국어 · 한국사' },
  { id: 'office', name: '사무 · 회계' },
  { id: 'safety', name: '안전 · 환경 · 품질' },
];

const LINKS: LinksFile = {
  patterns: { qnetDetail: { template: 'https://q-net.example/?jmCd={jmCd}', verified: true } },
  common: { qnetApplyGuide: 'https://q-net.example/apply' },
};

const META = {
  fetchedAt: `${TODAY}T00:55:45.144Z`,
  sources: { qnet: { health: 'ok', method: 'api', fetchedAt: `${TODAY}T00:55:45.144Z`, sessionCount: 3 } },
} as unknown as MetaFile;

const sessionsByGroup = new Map<string, Session[]>();
for (const s of SESSIONS) sessionsByGroup.set(s.groupId, [...(sessionsByGroup.get(s.groupId) ?? []), s]);

const INPUT: BrowseInput = {
  exams: EXAMS,
  groupById: new Map(GROUPS.map(g => [g.id, g])),
  sessionsByGroup,
  categoryById: new Map(CATEGORIES.map(c => [c.id, c])),
  meta: META,
  links: LINKS,
  jmCds: jmCdWhitelist(EXAMS),
  today: TODAY,
};

const ROWS = buildRows(INPUT);
const INDEX = buildSearchIndex(EXAMS, GROUPS, CATEGORIES);
const rowOf = (slug: string) => ROWS.find(r => r.exam.slug === slug)!;
const q = (o: Partial<typeof EMPTY_EXAMS_QUERY> = {}) => ({ ...EMPTY_EXAMS_QUERY, ...o });
const slugs = (rows: typeof ROWS) => rows.map(r => r.exam.slug);

// ---- 행 만들기 (§4.1) --------------------------------------------------

test('행이 §4.1 의 필수 정보를 모두 담는다', () => {
  const row = rowOf('정보처리기사');
  assert.equal(row.agency, '한국산업인력공단');
  assert.equal(row.categoryName, 'IT · 개발');
  assert.equal(row.status.id, 'reg-open');
  assert.equal(row.nextReg?.label, '실기 원서접수');
  assert.equal(row.nextExam?.label, '실기시험');
  assert.ok(row.link.href, '공식 링크가 없다');
  assert.ok(row.freshness.label.length > 0);
});

test('진행 중인 접수를 미래 접수보다 먼저 고른다', () => {
  // 오늘 열려 있는데 다음 회차 시작일을 보여주면 지금 할 수 있는 일을 놓친다.
  const row = rowOf('정보처리기사');
  assert.equal(row.nextReg?.start, '2026-08-10');
});

test('모든 종목이 공식 링크를 갖는다', () => {
  for (const row of ROWS) {
    // 정보보안기사만 jmCd·기관 주소가 모두 없다 — 그 경우 문구가 나온다
    if (row.exam.slug === '정보보안기사') assert.equal(row.link.kind, 'none');
    else assert.ok(row.link.href, row.exam.slug);
  }
});

test('상시시험 행도 만들어진다', () => {
  const row = rowOf('컴퓨터활용능력1급');
  assert.equal(row.status.id, 'rolling');
  assert.equal(row.nextReg, null);
  assert.equal(row.nextExam, null);
});

test('일정이 없는 그룹의 행도 죽지 않는다', () => {
  const row = rowOf('정보보안기사');
  assert.equal(row.status.id, 'tbd');
});

// ---- 필터 (§6.4) -------------------------------------------------------

test('분야 필터', () => {
  assert.deepEqual(slugs(filterRows(ROWS, q({ category: 'lang' }), INDEX)), ['토익']);
});

test('기관 필터', () => {
  assert.deepEqual(slugs(filterRows(ROWS, q({ agency: 'YBM' }), INDEX)), ['토익']);
});

test('유형 필터', () => {
  assert.deepEqual(slugs(filterRows(ROWS, q({ cadence: 'rolling' }), INDEX)), ['컴퓨터활용능력1급']);
  assert.deepEqual(slugs(filterRows(ROWS, q({ cadence: 'frequent' }), INDEX)), ['토익']);
});

test('상태 필터 — 접수 중은 임박도 함께 잡는다', () => {
  const open = slugs(filterRows(ROWS, q({ status: 'open' }), INDEX));
  assert.ok(open.includes('정보처리기사'), '접수 중이 빠졌다');
  assert.ok(open.includes('SQLD'), '마감 임박이 빠졌다');
  assert.ok(!open.includes('토익'));
});

test('상태 필터 — 미공고와 상시', () => {
  assert.deepEqual(slugs(filterRows(ROWS, q({ status: 'tbd' }), INDEX)), ['정보보안기사']);
  assert.deepEqual(slugs(filterRows(ROWS, q({ status: 'rolling' }), INDEX)), ['컴퓨터활용능력1급']);
});

test('필터는 AND 로 묶인다', () => {
  const both = filterRows(ROWS, q({ category: 'it', status: 'open' }), INDEX);
  assert.ok(slugs(both).includes('SQLD'));
  assert.ok(!slugs(both).includes('토익'), '다른 분야가 섞였다');
});

test('§5.3-B 이번 달 시험 바로가기', () => {
  // /exams?date=2026-09&kind=exam
  const rows = filterRows(ROWS, q({ month: '2026-09', kinds: ['exam'] }), INDEX);
  assert.ok(slugs(rows).includes('SQLD'), '9월 12일 시험이 빠졌다');
  assert.ok(slugs(rows).includes('토익'), '9월 20일 시험이 빠졌다');
  assert.ok(!slugs(rows).includes('정보처리기사'), '10월 시험이 섞였다');
});

test('검색어가 결과를 좁히고 순위를 준다', () => {
  const rows = filterRows(ROWS, q({ q: 'SQLD' }), INDEX);
  assert.equal(rows[0]!.exam.slug, 'SQLD');
});

test('검색어가 안 맞으면 빈 목록이다', () => {
  // §6.7 — 자동 교정하지 않는다.
  assert.deepEqual(filterRows(ROWS, q({ q: '있을리없는시험' }), INDEX), []);
});

test('필터가 없으면 전부 남는다', () => {
  assert.equal(filterRows(ROWS, q(), INDEX).length, EXAMS.length);
});

// ---- 정렬 (§6.5) -------------------------------------------------------

test('기본 정렬은 급한 것부터', () => {
  const sorted = sortRows(ROWS, 'deadline');
  // 마감 임박(SQLD, D-2) → 접수 중(기사 5종목) → 접수 예정(토익) → 상시 → 미공고
  assert.equal(sorted[0]!.exam.slug, 'SQLD');
  const ids = sorted.map(r => r.status.id);
  assert.equal(ids[0], 'reg-closing');
  assert.equal(ids[ids.length - 1], 'tbd');
});

test('같은 상태 안에서는 날짜, 그다음 이름', () => {
  const sorted = sortRows(ROWS.filter(r => r.status.id === 'reg-open'), 'deadline');
  // 다섯 종목이 같은 일정을 쓰므로 날짜가 같고 이름순이 된다
  assert.deepEqual(slugs(sorted), [...slugs(sorted)].sort((a, b) => a.localeCompare(b, 'ko')));
});

test('시험 가까운 순', () => {
  const sorted = sortRows(ROWS, 'exam');
  assert.equal(sorted[0]!.exam.slug, 'SQLD'); // 9/12
  assert.equal(sorted[1]!.exam.slug, '토익'); // 9/20
});

test('시험 없는 것은 뒤로 간다', () => {
  const sorted = sortRows(ROWS, 'exam');
  const last = sorted[sorted.length - 1]!;
  assert.equal(last.nextExam, null);
});

test('시험명 순', () => {
  const sorted = sortRows(ROWS, 'name');
  assert.deepEqual(slugs(sorted).map(s => ROWS.find(r => r.exam.slug === s)!.exam.name),
    EXAMS.map(e => e.name).sort((a, b) => a.localeCompare(b, 'ko')));
});

test('검색 순위를 기본 정렬이 흐트러뜨리지 않는다', () => {
  // 헤더 자동완성과 목록이 다른 순서를 내면 사용자가 같은 검색을 두 번 한다.
  const rows = filterRows(ROWS, q({ q: '기사' }), INDEX);
  assert.deepEqual(slugs(sortRows(rows, 'deadline', true)), slugs(rows));
});

test('검색 중에도 다른 정렬은 적용된다', () => {
  const rows = filterRows(ROWS, q({ q: '기사' }), INDEX);
  const byName = sortRows(rows, 'name', true);
  assert.deepEqual(slugs(byName), [...slugs(byName)].sort((a, b) => a.localeCompare(b, 'ko')));
});

test('정렬이 원본을 건드리지 않는다', () => {
  const before = slugs(ROWS);
  sortRows(ROWS, 'name');
  assert.deepEqual(slugs(ROWS), before);
});

// ---- 지금 접수 중 (§5.3-C) ---------------------------------------------

test('한 시행그룹이 목록을 독차지하지 못한다', () => {
  // 접지 않으면 정기검정 하나가 다섯 자리를 다 먹는다. 실측 29종목.
  const groups = openNow(ROWS, 5, 3);
  const hrdk = groups.find(g => g.groupId === 'hrdk-regular')!;
  assert.equal(hrdk.rows.length, 3);
  assert.equal(hrdk.more.length, 2, '나머지가 접히지 않았다');
});

test('접은 것을 버리지 않는다', () => {
  const groups = openNow(ROWS, 5, 3);
  const total = groups.reduce((n, g) => n + g.rows.length + g.more.length, 0);
  const open = ROWS.filter(r => r.status.id === 'reg-open' || r.status.id === 'reg-closing').length;
  assert.equal(total, open);
});

test('마감이 가까운 그룹이 먼저 온다', () => {
  const groups = openNow(ROWS, 5, 3);
  assert.equal(groups[0]!.groupId, 'kdata-sqld'); // 8/16 마감
});

test('전체 노출 수를 넘기지 않는다', () => {
  const shown = openNow(ROWS, 4, 3).reduce((n, g) => n + g.rows.length, 0);
  assert.ok(shown <= 4, `${shown}개가 나왔다`);
});

test('접수 중이 없으면 빈 배열', () => {
  const none = ROWS.filter(r => r.status.id === 'reg-upcoming');
  assert.deepEqual(openNow(none), []);
});

test('곧 시작하는 시험을 대신 내놓을 수 있다', () => {
  // §5.4 — 접수 중이 없으면 곧 시작하는 3개.
  assert.deepEqual(slugs(startingSoon(ROWS, 3)), ['토익']);
});

// ---- 분야별 (§5.3-D) ---------------------------------------------------

test('분야마다 대표 몇 개만 낸다', () => {
  const cats = byCategory(ROWS, CATEGORIES, 3);
  const it = cats.find(c => c.category.id === 'it')!;
  assert.equal(it.rows.length, 3);
  assert.equal(it.total, 7); // 기사 5 + SQLD + 정보보안기사
});

test('시드 우선순위가 대표를 정한다', () => {
  const it = byCategory(ROWS, CATEGORIES, 3).find(c => c.category.id === 'it')!;
  assert.equal(it.rows[0]!.exam.priority, 1);
});

test('데이터가 없는 분야는 숨긴다', () => {
  // §5.4 — 카테고리 자체를 감춘다.
  const ids = byCategory(ROWS, CATEGORIES).map(c => c.category.id);
  assert.ok(!ids.includes('safety'), '빈 분야가 남았다');
});
