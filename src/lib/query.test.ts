// node --test src/lib/query.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SORT,
  EMPTY_EXAMS_QUERY,
  MAX_CALENDAR_EXAMS,
  activeFilterCount,
  parseCalendarQuery,
  parseExamsQuery,
  toCalendarSearch,
  toExamsSearch,
} from './query.ts';

const KNOWN = {
  categoryIds: ['it', 'office', 'safety', 'eng', 'service', 'skill', 'lang'],
  agencies: ['한국산업인력공단', 'YBM', '대한상공회의소'],
  slugs: ['정보처리기사', 'SQLD', '토익', '컴퓨터활용능력1급', '산업안전기사', '한국사능력검정시험', 'ADsP'],
};

const parse = (s: string) => parseExamsQuery(s, KNOWN);
const cal = (s: string) => parseCalendarQuery(s, KNOWN);

// ---- 탐색 화면 (§6.2) --------------------------------------------------

test('빈 질의는 기본값이다', () => {
  assert.deepEqual(parse(''), EMPTY_EXAMS_QUERY);
  assert.deepEqual(parse('?'), EMPTY_EXAMS_QUERY);
});

test('§6.2 의 예시 URL 을 그대로 읽는다', () => {
  assert.equal(parse('?q=정보').q, '정보');
  assert.equal(parse('?category=it').category, 'it');
  assert.equal(parse('?status=open').status, 'open');
  assert.equal(parse('?date=2026-10').month, '2026-10');
  const combo = parse('?category=it&status=upcoming&sort=deadline');
  assert.equal(combo.category, 'it');
  assert.equal(combo.status, 'upcoming');
  assert.equal(combo.sort, 'deadline');
});

test('앞에 경로가 붙어 있어도 읽는다', () => {
  assert.equal(parse('/exams?q=정보').q, '정보');
});

test('§5.3-B 홈 바로가기가 만드는 URL 을 읽는다', () => {
  // 이번 달 시험 → /exams?date={이번달}&kind=exam. 단수 kind 를 쓴다.
  const q = parse('?date=2026-08&kind=exam');
  assert.equal(q.month, '2026-08');
  assert.deepEqual(q.kinds, ['exam']);
  assert.equal(parse('?cadence=rolling').cadence, 'rolling');
});

test('검색어 앞뒤 공백을 턴다', () => {
  assert.equal(parse('?q=%20%20정보%20%20').q, '정보');
});

test('직렬화와 파싱이 왕복한다', () => {
  const q = parse('?q=정보&category=it&status=open&date=2026-10&kinds=reg,exam&cadence=periodic&agency=YBM&sort=name');
  assert.deepEqual(parse(toExamsSearch(q)), q);
});

test('기본값은 주소에 쓰지 않는다', () => {
  // /exams 와 /exams?sort=deadline&q= 가 같은 화면인데 주소만 다르면 공유 링크가
  // 지저분해지고 canonical 판단도 흐려진다.
  assert.equal(toExamsSearch(EMPTY_EXAMS_QUERY), '');
  assert.equal(toExamsSearch({ ...EMPTY_EXAMS_QUERY, sort: DEFAULT_SORT }), '');
  assert.equal(toExamsSearch({ ...EMPTY_EXAMS_QUERY, sort: 'name' }), '?sort=name');
});

test('한글 검색어가 왕복한다', () => {
  const q = { ...EMPTY_EXAMS_QUERY, q: '정보처리기사' };
  assert.deepEqual(parse(toExamsSearch(q)), q);
});

// ---- 모르는 값 --------------------------------------------------------

test('모르는 상태·정렬·유형은 기본값으로 떨어진다', () => {
  assert.equal(parse('?status=말도안됨').status, null);
  assert.equal(parse('?sort=말도안됨').sort, DEFAULT_SORT);
  assert.equal(parse('?cadence=말도안됨').cadence, null);
});

test('데이터에 없는 카테고리·기관은 버린다', () => {
  // 없는 값으로 필터가 걸리면 결과가 늘 0 인데 사용자는 이유를 알 수 없다.
  assert.equal(parse('?category=없는분야').category, null);
  assert.equal(parse('?agency=없는기관').agency, null);
});

test('알려진 값 목록을 안 주면 검사하지 않는다', () => {
  // 사전 렌더처럼 데이터가 아직 없는 자리에서도 파싱은 돌아야 한다.
  assert.equal(parseExamsQuery('?category=whatever').category, 'whatever');
});

test('달 형식이 아니면 버린다', () => {
  for (const bad of ['2026-13', '2026-00', '2026', '26-10', '2026-1', 'nope']) {
    assert.equal(parse(`?date=${bad}`).month, null, bad);
  }
});

test('일정 종류 목록에서 모르는 값만 빠진다', () => {
  assert.deepEqual(parse('?kinds=reg,없음,exam').kinds, ['reg', 'exam']);
});

test('일정 종류는 선언 순서로 정규화한다', () => {
  // 같은 뜻의 URL 이 두 가지가 되지 않게 한다.
  assert.deepEqual(parse('?kinds=exam,reg').kinds, ['reg', 'exam']);
  assert.equal(toExamsSearch(parse('?kinds=exam,reg')), '?kinds=reg%2Cexam');
});

test('중복된 일정 종류를 접는다', () => {
  assert.deepEqual(parse('?kinds=reg,reg,exam').kinds, ['reg', 'exam']);
});

test('망가진 주소에도 던지지 않는다', () => {
  for (const bad of ['?%', '?q=%E0%A4%A', '?kinds=', '?&&&', '?=value']) {
    assert.doesNotThrow(() => parse(bad), bad);
  }
});

// ---- 필터 개수 --------------------------------------------------------

test('걸린 필터 수를 센다', () => {
  assert.equal(activeFilterCount(EMPTY_EXAMS_QUERY), 0);
  // 정렬은 필터가 아니다 — 초기화해도 결과 집합이 그대로다.
  assert.equal(activeFilterCount({ ...EMPTY_EXAMS_QUERY, sort: 'name' }), 0);
  assert.equal(activeFilterCount(parse('?q=정보&category=it&status=open')), 3);
});

// ---- 통합 캘린더 (§8.2) ------------------------------------------------

test('§8.2 의 예시 URL 을 그대로 읽는다', () => {
  assert.deepEqual(cal('?month=2026-10').query.month, '2026-10');
  const a = cal('?exams=정보처리기사,SQLD,토익&month=2026-10');
  assert.deepEqual(a.query.exams, ['정보처리기사', 'SQLD', '토익']);
  assert.equal(a.query.month, '2026-10');
  const b = cal('?category=it&kinds=reg,exam');
  assert.equal(b.query.category, 'it');
  assert.deepEqual(b.query.kinds, ['reg', 'exam']);
});

test('선택 없이도 정상이다', () => {
  const { query, missing } = cal('');
  assert.deepEqual(query.exams, []);
  assert.deepEqual(missing, []);
});

test('중복 선택을 접는다', () => {
  assert.deepEqual(cal('?exams=SQLD,SQLD,토익').query.exams, ['SQLD', '토익']);
});

test('없는 시험은 조용히 버리지 않고 알린다', () => {
  // §8.12 — "일부 시험을 찾지 못했어요". 조용히 지우면 사용자는 자기가 고른
  // 시험이 왜 사라졌는지 알 수 없다.
  const { query, missing } = cal('?exams=정보처리기사,없는시험');
  assert.deepEqual(query.exams, ['정보처리기사']);
  assert.deepEqual(missing, ['없는시험']);
});

test('여섯 개를 넘으면 넘친 것도 알린다', () => {
  assert.equal(MAX_CALENDAR_EXAMS, 6);
  const seven = [...KNOWN.slugs];
  assert.equal(seven.length, 7);
  const { query, missing } = cal(`?exams=${seven.join(',')}`);
  assert.equal(query.exams.length, 6);
  assert.deepEqual(missing, [seven[6]]);
});

test('한글 slug 가 인코딩을 거쳐 왕복한다', () => {
  const query = { exams: ['정보처리기사', '한국사능력검정시험'], month: '2026-10', category: null, kinds: [] };
  const search = toCalendarSearch(query);
  assert.ok(search.includes('%'), '한글이 인코딩되지 않았다');
  assert.deepEqual(parseCalendarQuery(search, KNOWN).query, query);
});

test('조합형 slug 를 완성형으로 맞춘다', () => {
  const nfd = '정보처리기사'.normalize('NFD');
  const { query, missing } = cal(`?exams=${encodeURIComponent(nfd)}`);
  assert.deepEqual(query.exams, ['정보처리기사']);
  assert.deepEqual(missing, []);
});

test('빈 항목은 없는 것으로 친다', () => {
  const { query, missing } = cal('?exams=,,정보처리기사,,');
  assert.deepEqual(query.exams, ['정보처리기사']);
  assert.deepEqual(missing, []);
});

test('직렬화는 상한을 넘기지 않는다', () => {
  const search = toCalendarSearch({ exams: KNOWN.slugs.slice(), month: null, category: null, kinds: [] });
  assert.equal(parseCalendarQuery(search, KNOWN).query.exams.length, 6);
});

test('캘린더 기본값도 주소에 쓰지 않는다', () => {
  assert.equal(toCalendarSearch({ exams: [], month: null, category: null, kinds: [] }), '');
});
