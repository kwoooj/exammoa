// node --test src/lib/head.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Exam, ScheduleGroup, Session } from '../types.ts';
import { examPath, matchRoute } from './routes.ts';
import { SITE_NAME, headFor } from './head.ts';

const ORIGIN = 'https://exammoa.example';
const TODAY = '2026-08-14';

const 정보처리기사: Exam = {
  slug: '정보처리기사', name: '정보처리기사', short: '정처기', groupId: 'hrdk-regular',
  jmCd: '1320', qualgbCd: 'T', series: '기사', category: 'it', tier: 'T1', priority: 1,
};

const hrdkRegular: ScheduleGroup = {
  id: 'hrdk-regular', name: '국가기술자격 정기검정', agency: '한국산업인력공단',
  cadence: 'periodic', examSlugs: ['정보처리기사'],
};

const 기사3회: Session = {
  id: 'hrdk-regular-2026-3', groupId: 'hrdk-regular', year: 2026, seq: 3,
  label: '국가기술자격 기사 (2026년도 제3회)', mode: 'scheduled', status: 'confirmed',
  events: [
    { kind: 'exam', phase: 'written', start: '2026-08-07', end: '2026-09-01', seq: 1, label: '필기시험', note: null },
    { kind: 'reg', phase: 'practical', start: '2026-09-21', end: '2026-10-19', seq: 1, label: '실기 원서접수', note: null },
    { kind: 'exam', phase: 'practical', start: '2026-10-24', end: '2026-11-13', seq: 1, label: '실기시험', note: null },
  ],
};

const 컴활1급: Exam = {
  slug: '컴퓨터활용능력1급', name: '컴퓨터활용능력 1급', short: '컴활1급', groupId: 'korcham-rolling',
  jmCd: null, qualgbCd: null, series: null, category: 'office', tier: 'T4', priority: 1, rolling: true,
};
const korchamRolling: ScheduleGroup = {
  id: 'korcham-rolling', name: '컴퓨터활용능력', agency: '대한상공회의소', cadence: 'rolling',
  rollingRule: '상시시험. 접수는 시험일 4일 전까지', examSlugs: ['컴퓨터활용능력1급'],
};
const 상시회차: Session = {
  id: 'korcham-rolling-2026-rolling', groupId: 'korcham-rolling', year: 2026,
  seq: null, label: null, mode: 'rolling', status: 'confirmed', events: [],
};

const detail = (exam: Exam | undefined, group: ScheduleGroup | undefined, sessions: Session[], slug = exam?.slug ?? '없는시험') =>
  headFor({ match: matchRoute(examPath(slug)), today: TODAY, origin: ORIGIN, exam, group, sessions });

// ---- 상세 페이지 (§7.2) ------------------------------------------------

test('제목이 §7.2 의 형식을 따른다', () => {
  const h = detail(정보처리기사, hrdkRegular, [기사3회]);
  assert.equal(h.title, `정보처리기사 2026 시험일정·원서접수 | ${SITE_NAME}`);
});

test('설명에 가장 가까운 일정이 들어간다', () => {
  const h = detail(정보처리기사, hrdkRegular, [기사3회]);
  assert.ok(h.description.includes('필기시험'), h.description);
  assert.ok(h.description.includes('2026.08.07'), h.description);
  assert.ok(h.description.includes('한국산업인력공단'), h.description);
});

test('canonical 은 절대 주소이고 쿼리를 담지 않는다', () => {
  // 담으면 /exams? 의 필터 조합이 무한한 크롤 공간이 된다.
  const h = headFor({
    match: matchRoute(`${examPath('정보처리기사')}?year=2025`),
    today: TODAY, origin: ORIGIN, exam: 정보처리기사, group: hrdkRegular, sessions: [기사3회],
  });
  assert.equal(h.canonical, `${ORIGIN}${examPath('정보처리기사')}`);
  assert.ok(!h.canonical.includes('?'));
});

test('origin 뒤 슬래시를 겹치지 않는다', () => {
  const h = headFor({
    match: matchRoute('/'), today: TODAY, origin: 'https://exammoa.example/',
  });
  assert.equal(h.canonical, 'https://exammoa.example/');
});

test('상시시험 설명은 규칙을 말하고 날짜를 짓지 않는다', () => {
  const h = detail(컴활1급, korchamRolling, [상시회차]);
  assert.ok(h.description.includes('상시시험'), h.description);
  assert.ok(h.description.includes('시험일 4일 전까지'), h.description);
  assert.ok(!/\d{4}\.\d{2}\.\d{2}/.test(h.description), '없는 날짜를 지어냈다');
});

test('미공고 설명은 없다고 말한다', () => {
  // "곧 공개됩니다" 같은 말을 지어내면 검색 결과에서 기대를 만들고
  // 들어온 사람이 빈 화면을 본다.
  const h = detail(정보처리기사, hrdkRegular, []);
  assert.ok(h.description.includes('아직 발표되지 않았'), h.description);
});

// ---- 구조화 데이터 -----------------------------------------------------

test('확정된 미래 시험이 있으면 구조화 데이터를 낸다', () => {
  const h = detail(정보처리기사, hrdkRegular, [기사3회]);
  const ld = h.jsonLd as { itemListElement: { item: { startDate: string; endDate: string } }[] };
  assert.ok(ld);
  assert.equal(ld.itemListElement.length, 2); // 필기(8/7~9/1) · 실기(10/24~11/13)
  assert.equal(ld.itemListElement[0]!.item.startDate, '2026-08-07');
});

test('기간 시행을 하루로 줄이지 않는다', () => {
  // 줄이면 우리가 날짜를 만든 것이 된다.
  const h = detail(정보처리기사, hrdkRegular, [기사3회]);
  const ld = h.jsonLd as { itemListElement: { item: { startDate: string; endDate: string } }[] };
  assert.equal(ld.itemListElement[0]!.item.endDate, '2026-09-01');
});

test('상시시험에는 구조화 데이터를 붙이지 않는다', () => {
  // 없는 날짜를 검색엔진이라는 확성기에 실어 보내지 않는다.
  assert.equal(detail(컴활1급, korchamRolling, [상시회차]).jsonLd, undefined);
});

test('미공고에도 붙이지 않는다', () => {
  assert.equal(detail(정보처리기사, hrdkRegular, []).jsonLd, undefined);
});

test('진행 중인 시험 기간이 빠지지 않는다', () => {
  // start >= today 로 자르면 26일짜리 필기 CBT 가 시작 다음 날부터 사라진다.
  // 지금 치르고 있는 시험이야말로 검색으로 들어오는 사람이 찾는 것이다.
  const h = detail(정보처리기사, hrdkRegular, [기사3회]);
  const ld = h.jsonLd as { itemListElement: { item: { name: string } }[] };
  assert.ok(ld.itemListElement.some(x => x.item.name.includes('필기시험')));
});

test('지난 일정에는 붙이지 않는다', () => {
  const h = headFor({
    match: matchRoute(examPath('정보처리기사')), today: '2026-12-31', origin: ORIGIN,
    exam: 정보처리기사, group: hrdkRegular, sessions: [기사3회],
  });
  assert.equal(h.jsonLd, undefined);
});

test('구조화 데이터가 JSON 으로 직렬화된다', () => {
  const h = detail(정보처리기사, hrdkRegular, [기사3회]);
  assert.doesNotThrow(() => JSON.stringify(h.jsonLd));
});

// ---- 없는 시험 (§11) ---------------------------------------------------

test('없는 시험은 색인을 막고 404 를 canonical 로 둔다', () => {
  // 다른 시험으로 자동 이동시키지 않는다.
  const h = detail(undefined, undefined, []);
  assert.equal(h.robots, 'noindex, follow');
  assert.equal(h.canonical, `${ORIGIN}/404`);
  assert.equal(h.jsonLd, undefined);
});

test('404 라우트도 색인을 막는다', () => {
  const h = headFor({ match: matchRoute('/없는경로'), today: TODAY, origin: ORIGIN });
  assert.equal(h.robots, 'noindex, follow');
});

// ---- 정적 라우트 -------------------------------------------------------

test('라우트마다 제목과 설명이 다르다', () => {
  const paths = ['/', '/exams', '/calendar', '/about', '/privacy'];
  const heads = paths.map(p => headFor({ match: matchRoute(p), today: TODAY, origin: ORIGIN }));
  assert.equal(new Set(heads.map(h => h.title)).size, paths.length);
  assert.equal(new Set(heads.map(h => h.description)).size, paths.length);
  assert.equal(new Set(heads.map(h => h.canonical)).size, paths.length);
});

test('색인해야 할 페이지에는 robots 를 붙이지 않는다', () => {
  for (const p of ['/', '/exams', '/calendar', '/about', '/privacy']) {
    assert.equal(headFor({ match: matchRoute(p), today: TODAY, origin: ORIGIN }).robots, undefined, p);
  }
});

test('홈 설명에 규모를 넣을 수 있다', () => {
  const h = headFor({
    match: matchRoute('/'), today: TODAY, origin: ORIGIN, counts: { exams: 62, groups: 19 },
  });
  assert.ok(h.description.includes('62개 시험'), h.description);
  assert.ok(h.description.includes('19개 시행그룹'), h.description);
});

test('규모를 모르면 그 부분만 빠진다', () => {
  const h = headFor({ match: matchRoute('/'), today: TODAY, origin: ORIGIN });
  assert.ok(!h.description.includes('개 시행그룹'), h.description);
  assert.ok(h.description.length > 0);
});

test('탐색 canonical 에 필터가 남지 않는다', () => {
  const h = headFor({ match: matchRoute('/exams?category=it&status=open'), today: TODAY, origin: ORIGIN });
  assert.equal(h.canonical, `${ORIGIN}/exams`);
});

// ---- 공통 --------------------------------------------------------------

test('제목과 설명이 비지 않는다', () => {
  const cases = [
    headFor({ match: matchRoute('/'), today: TODAY, origin: ORIGIN }),
    headFor({ match: matchRoute('/exams'), today: TODAY, origin: ORIGIN }),
    headFor({ match: matchRoute('/calendar'), today: TODAY, origin: ORIGIN }),
    headFor({ match: matchRoute('/about'), today: TODAY, origin: ORIGIN }),
    headFor({ match: matchRoute('/privacy'), today: TODAY, origin: ORIGIN }),
    headFor({ match: matchRoute('/nope'), today: TODAY, origin: ORIGIN }),
    detail(정보처리기사, hrdkRegular, [기사3회]),
    detail(컴활1급, korchamRolling, [상시회차]),
    detail(undefined, undefined, []),
  ];
  for (const h of cases) {
    assert.ok(h.title.length > 0);
    assert.ok(h.description.length > 0);
    assert.ok(h.canonical.startsWith(ORIGIN));
    // 설명이 길면 검색 결과에서 잘린다. 잘려도 뜻이 통하는 길이로 둔다.
    assert.ok(h.description.length < 200, `${h.description.length}자: ${h.description}`);
  }
});

test('해가 바뀌면 제목의 연도도 바뀐다', () => {
  const h = headFor({
    match: matchRoute(examPath('정보처리기사')), today: '2027-03-01', origin: ORIGIN,
    exam: 정보처리기사, group: hrdkRegular, sessions: [기사3회],
  });
  assert.ok(h.title.startsWith('정보처리기사 2027'), h.title);
});
