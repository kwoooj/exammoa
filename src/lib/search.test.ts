// node --test src/lib/search.test.ts
//
// 픽스처는 data/published/exams.json 의 실측값을 손으로 옮긴 것이다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Category, Exam, ScheduleGroup } from '../types.ts';
import { MIN_QUERY, buildSearchIndex, normalizeQuery, searchExams } from './search.ts';

// ---- 실측 픽스처 -------------------------------------------------------

const exam = (o: Partial<Exam> & Pick<Exam, 'slug' | 'name' | 'groupId' | 'category' | 'priority'>): Exam => ({
  short: null, jmCd: null, qualgbCd: null, series: null, tier: 'T1', ...o,
});

const EXAMS: Exam[] = [
  exam({ slug: '정보처리기사', name: '정보처리기사', short: '정처기', groupId: 'hrdk-regular', category: 'it', priority: 1, jmCd: '1320' }),
  exam({ slug: '정보처리산업기사', name: '정보처리산업기사', short: null, groupId: 'hrdk-regular', category: 'it', priority: 2, jmCd: '2290' }),
  exam({ slug: '빅데이터분석기사', name: '빅데이터분석기사', short: '빅분기', groupId: 'kdata-bigdata', category: 'it', priority: 1 }),
  exam({ slug: 'SQLD', name: 'SQL 개발자', short: 'SQLD', groupId: 'kdata-sqld', category: 'it', priority: 1 }),
  exam({ slug: 'ADsP', name: '데이터분석 준전문가', short: 'ADsP', groupId: 'kdata-adsp', category: 'it', priority: 2 }),
  exam({ slug: '토익', name: 'TOEIC', short: '토익', groupId: 'toeic', category: 'lang', priority: 1, agency: 'YBM' }),
  exam({ slug: '오픽', name: 'OPIc', short: '오픽', groupId: 'opic', category: 'lang', priority: 2, agency: '멀티캠퍼스 OPIc' }),
  exam({ slug: '산업안전기사', name: '산업안전기사', short: null, groupId: 'hrdk-regular', category: 'safety', priority: 1, jmCd: '2290' }),
];

const GROUPS: ScheduleGroup[] = [
  { id: 'hrdk-regular', name: '국가기술자격 정기검정', agency: '한국산업인력공단', cadence: 'periodic', examSlugs: [] },
  { id: 'kdata-bigdata', name: '빅데이터분석기사', agency: '한국데이터산업진흥원', cadence: 'periodic', examSlugs: [] },
  { id: 'kdata-sqld', name: 'SQLD', agency: '한국데이터산업진흥원', cadence: 'periodic', examSlugs: [] },
  { id: 'kdata-adsp', name: 'ADsP', agency: '한국데이터산업진흥원', cadence: 'periodic', examSlugs: [] },
  { id: 'toeic', name: 'TOEIC', agency: 'YBM', cadence: 'frequent', examSlugs: [] },
  { id: 'opic', name: 'OPIc', agency: '멀티캠퍼스 OPIc', cadence: 'rolling', rollingRule: '상시 시행', examSlugs: [] },
];

const CATEGORIES: Category[] = [
  { id: 'it', name: 'IT · 개발' },
  { id: 'lang', name: '어학 · 국어 · 한국사' },
  { id: 'safety', name: '안전 · 환경 · 품질' },
];

const INDEX = buildSearchIndex(EXAMS, GROUPS, CATEGORIES);
const find = (q: string) => searchExams(INDEX, q).map(h => h.entry.slug);
const levelOf = (q: string, slug: string) => searchExams(INDEX, q).find(h => h.entry.slug === slug)?.level;

// ---- 다섯 단계 ---------------------------------------------------------

test('1단계 — 시험명 정확 일치가 가장 앞이다', () => {
  // '정보처리기사' 를 친 사람에게 '정보처리산업기사' 가 먼저 나오면 고장난 것처럼 읽힌다.
  assert.equal(find('정보처리기사')[0], '정보처리기사');
  assert.equal(levelOf('정보처리기사', '정보처리기사'), 1);
});

test('2단계 — 약칭 정확 일치', () => {
  assert.equal(levelOf('정처기', '정보처리기사'), 2);
  assert.equal(find('정처기')[0], '정보처리기사');
});

test('3단계 — 시험명 앞부분 일치', () => {
  assert.equal(levelOf('정보처', '정보처리기사'), 3);
});

test('4단계 — 시험명 부분 일치', () => {
  assert.equal(levelOf('처리기사', '정보처리기사'), 4);
});

test('5단계 — 시행기관 일치', () => {
  const hits = find('한국산업인력공단');
  assert.ok(hits.includes('정보처리기사'));
  assert.ok(hits.includes('산업안전기사'));
  assert.equal(levelOf('한국산업인력공단', '정보처리기사'), 5);
});

test('5단계 — 카테고리명 일치', () => {
  const hits = find('어학');
  assert.deepEqual(hits, ['토익', '오픽']);
});

test('단계가 낮은 것이 항상 앞에 온다', () => {
  // '정보' 는 두 종목의 앞부분(3단계)이고 다른 것에는 안 걸린다.
  const hits = searchExams(INDEX, '기사');
  const levels = hits.map(h => h.level);
  assert.deepEqual([...levels].sort((a, b) => a - b), levels);
});

// ---- 약칭 부분 일치 ----------------------------------------------------

test('약칭 앞부분으로도 찾는다', () => {
  // §2.2 는 약칭 '정확' 일치만 단계로 적었지만 검색 대상에 약칭을 넣어 두었다.
  // '정처' 를 친 사람에게 아무것도 안 주는 것은 그 목록의 뜻이 아니다.
  assert.equal(levelOf('정처', '정보처리기사'), 3);
});

test('약칭 정확 일치가 이름 앞부분 일치를 이긴다', () => {
  assert.ok(levelOf('정처기', '정보처리기사')! < 3);
});

// ---- 대소문자 · 정규화 -------------------------------------------------

test('대소문자를 가리지 않는다', () => {
  for (const q of ['SQLD', 'sqld', 'Sqld']) assert.deepEqual(find(q), ['SQLD'], q);
  for (const q of ['ADsP', 'adsp', 'ADSP']) assert.deepEqual(find(q), ['ADsP'], q);
});

test('한글 별칭으로 영문 시험명 OPIc을 찾는다', () => {
  assert.deepEqual(find('오픽'), ['오픽']);
  assert.equal(levelOf('오픽', '오픽'), 2);
});

test('조합형으로 들어와도 완성형 데이터에 걸린다', () => {
  // IME 와 붙여넣기가 NFD 를 낼 수 있다. 눈으로는 똑같아서 재현조차 어렵다.
  const nfd = '정보처리기사'.normalize('NFD');
  assert.notEqual(nfd, '정보처리기사');
  assert.equal(find(nfd)[0], '정보처리기사');
});

test('앞뒤 공백을 무시한다', () => {
  assert.equal(find('  정처기  ')[0], '정보처리기사');
});

test('정규화 함수가 세 가지를 한꺼번에 한다', () => {
  assert.equal(normalizeQuery('  SQLD '.normalize('NFD')), 'sqld');
});

// ---- 최소 길이 --------------------------------------------------------

test('한 글자로는 자동완성을 내지 않는다', () => {
  assert.equal(MIN_QUERY, 2);
  assert.deepEqual(searchExams(INDEX, '정'), []);
  assert.deepEqual(searchExams(INDEX, ''), []);
  assert.deepEqual(searchExams(INDEX, '   '), []);
});

test('두 글자부터 낸다', () => {
  assert.ok(searchExams(INDEX, '정보').length > 0);
});

// ---- 순서 안정성 -------------------------------------------------------

test('같은 단계에서는 시드 우선순위가 앞이고 그다음 가나다순이다', () => {
  // '기사' 는 네 종목 모두에 부분 일치(4단계)라 단계로는 갈리지 않는다.
  // priority 1 셋이 가나다순으로 먼저, priority 2 인 정보처리산업기사가 뒤.
  assert.deepEqual(find('기사'), [
    '빅데이터분석기사', '산업안전기사', '정보처리기사', '정보처리산업기사',
  ]);
});

test('단계가 다르면 우선순위보다 단계가 먼저다', () => {
  // 데이터분석 준전문가는 앞부분 일치(3단계)·priority 2,
  // 빅데이터분석기사는 부분 일치(4단계)·priority 1. 단계가 이긴다.
  // SQLD 는 이름에 없고 기관명(한국데이터산업진흥원)으로만 걸려 5단계다.
  assert.deepEqual(find('데이터'), ['ADsP', '빅데이터분석기사', 'SQLD']);
});

test('우선순위가 같으면 가나다순이다', () => {
  const 같은순위 = buildSearchIndex(
    [
      exam({ slug: '나기사', name: '나기사', groupId: 'hrdk-regular', category: 'it', priority: 1 }),
      exam({ slug: '가기사', name: '가기사', groupId: 'hrdk-regular', category: 'it', priority: 1 }),
    ], GROUPS, CATEGORIES);
  assert.deepEqual(searchExams(같은순위, '기사').map(h => h.entry.slug), ['가기사', '나기사']);
});

test('입력 순서를 바꿔도 결과가 같다', () => {
  const reversed = buildSearchIndex([...EXAMS].reverse(), GROUPS, CATEGORIES);
  assert.deepEqual(searchExams(reversed, '기사').map(h => h.entry.slug), find('기사'));
});

// ---- 결과 개수 --------------------------------------------------------

test('개수를 제한할 수 있다', () => {
  assert.equal(searchExams(INDEX, '기사', 2).length, 2);
});

test('제한을 주지 않으면 전부 준다', () => {
  assert.ok(searchExams(INDEX, '기사').length > 2);
});

test('안 걸리면 빈 배열이다', () => {
  // 화면정의 §6.7 — 자동 교정하지 않는다. 여기서 억지로 무언가를 돌려주면
  // 사용자가 엉뚱한 시험을 자기 시험으로 착각한다.
  assert.deepEqual(searchExams(INDEX, '있을리없는시험'), []);
});

// ---- 기관 귀속 --------------------------------------------------------

test('종목이 기관을 직접 들고 있으면 그것으로 검색된다', () => {
  assert.ok(find('YBM').includes('토익'));
});

test('종목에 없으면 그룹의 기관으로 검색된다', () => {
  assert.ok(find('한국데이터산업진흥원').includes('SQLD'));
});

test('기관을 알 수 없는 종목도 색인을 깨지 않는다', () => {
  const 고아 = buildSearchIndex(
    [exam({ slug: '고아시험', name: '고아시험', groupId: '없는그룹', category: 'it', priority: 1 })],
    GROUPS, CATEGORIES);
  assert.equal(고아[0]!.agency, '');
  assert.deepEqual(searchExams(고아, '고아시험').map(h => h.entry.slug), ['고아시험']);
});
