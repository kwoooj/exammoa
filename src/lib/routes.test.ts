// node --test src/lib/routes.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOT_FOUND_PATH, ROUTE_PATHS, decodeSegment, examPath, isInternalHref, matchRoute } from './routes.ts';

// ---- 정적 라우트 -------------------------------------------------------

test('화면정의 §1 의 정적 라우트를 전부 안다', () => {
  assert.equal(matchRoute('/').id, 'home');
  assert.equal(matchRoute('/exams').id, 'exams');
  assert.equal(matchRoute('/calendar').id, 'calendar');
  assert.equal(matchRoute('/about').id, 'about');
  assert.equal(matchRoute('/privacy').id, 'privacy');
  assert.equal(matchRoute(NOT_FOUND_PATH).id, 'notFound');
});

test('라우트 표와 매칭이 어긋나지 않는다', () => {
  // 사전 렌더가 ROUTE_PATHS 를 열거하므로 여기 있는 것은 전부 매칭돼야 한다.
  for (const [id, path] of Object.entries(ROUTE_PATHS)) {
    assert.equal(matchRoute(path).id, id, path);
  }
});

test('트레일링 슬래시가 있어도 같은 라우트다', () => {
  // 정적 호스트는 /exams 와 /exams/ 를 같은 파일로 준다. 라우터만 다르게 보면 404 다.
  assert.equal(matchRoute('/exams/').id, 'exams');
  assert.equal(matchRoute('/about//').id, 'about');
  assert.equal(matchRoute('/').id, 'home');
});

test('쿼리와 해시는 경로 매칭에 영향을 주지 않는다', () => {
  assert.equal(matchRoute('/exams?q=정보&status=open').id, 'exams');
  assert.equal(matchRoute('/calendar?month=2026-10#grid').id, 'calendar');
  assert.equal(matchRoute('/exams#top').id, 'exams');
});

test('모르는 경로는 404 다', () => {
  assert.equal(matchRoute('/nope').id, 'notFound');
  assert.equal(matchRoute('/exams/extra').id, 'notFound');
});

test('빈 경로는 홈이다', () => {
  // location.pathname 은 최소 '/' 라 브라우저에서는 안 생긴다. 사전 렌더 스크립트가
  // 경로를 조립하다 빈 문자열을 넘길 수는 있고, 그때 404 보다 홈이 옳다.
  assert.equal(matchRoute('').id, 'home');
});

// ---- 시험 상세 ---------------------------------------------------------

test('한글 slug 를 인코딩해 경로를 만든다', () => {
  assert.equal(
    examPath('정보처리기사'),
    '/exam/%EC%A0%95%EB%B3%B4%EC%B2%98%EB%A6%AC%EA%B8%B0%EC%82%AC',
  );
});

test('인코딩과 매칭이 왕복한다', () => {
  // 실측 slug 에서 뽑았다. 한글·영문·숫자·하이픈이 섞여 있다.
  const slugs = ['정보처리기사', 'SQLD', 'ADsP', 'ITQ', '컴퓨터활용능력1급', '토익스피킹', 'KBS한국어능력시험'];
  for (const slug of slugs) {
    const m = matchRoute(examPath(slug));
    assert.equal(m.id, 'exam', slug);
    assert.equal(m.params.slug, slug, slug);
  }
});

test('인코딩하지 않은 한글 경로도 받는다', () => {
  // 주소창에 붙여넣으면 브라우저가 디코드해 보여주고, 그대로 복사되는 일이 흔하다.
  const m = matchRoute('/exam/정보처리기사');
  assert.equal(m.id, 'exam');
  assert.equal(m.params.slug, '정보처리기사');
});

test('slug 가 없으면 404 다', () => {
  assert.equal(matchRoute('/exam/').id, 'notFound');
  assert.equal(matchRoute('/exam').id, 'notFound');
});

test('중첩 경로를 slug 로 삼지 않는다', () => {
  // 삼으면 없는 종목에 200 을 주고 검색엔진이 그것을 색인한다.
  assert.equal(matchRoute('/exam/정보처리기사/일정').id, 'notFound');
});

test('없는 시험도 라우트로는 exam 이다', () => {
  // 존재 여부는 데이터가 판단한다. 라우터가 미리 자르면 화면정의 §11 의
  // "다른 시험으로 자동 이동시키지 않는다" 를 지킬 자리가 사라진다.
  const m = matchRoute(examPath('있을리없는시험'));
  assert.equal(m.id, 'exam');
  assert.equal(m.params.slug, '있을리없는시험');
});

// ---- NFC 정규화 --------------------------------------------------------

test('조합형으로 들어온 한글을 완성형으로 맞춘다', () => {
  // macOS 는 파일명을 NFD 로 저장한다. 눈에 똑같은 주소가 404 가 되는 함정이다.
  const nfd = '정보처리기사'.normalize('NFD');
  assert.notEqual(nfd, '정보처리기사'); // 전제 확인 — 실제로 다른 바이트열이다
  assert.equal(matchRoute(`/exam/${encodeURIComponent(nfd)}`).params.slug, '정보처리기사');
});

test('경로를 만들 때도 정규화한다', () => {
  assert.equal(examPath('정보처리기사'.normalize('NFD')), examPath('정보처리기사'));
});

// ---- 잘못된 입력 -------------------------------------------------------

test('깨진 퍼센트 시퀀스에 죽지 않는다', () => {
  // 사용자가 주소를 손으로 고치다 만든 값이다. 페이지 전체가 죽으면 안 된다.
  assert.doesNotThrow(() => matchRoute('/exam/%ZZ'));
  assert.equal(matchRoute('/exam/%ZZ').id, 'notFound');
  assert.equal(decodeSegment('%E0%A4%A'), '');
});

test('앞에 슬래시가 없어도 매칭한다', () => {
  assert.equal(matchRoute('exams').id, 'exams');
});

// ---- 내부 링크 판별 ----------------------------------------------------

test('내부 링크만 가로챈다', () => {
  assert.ok(isInternalHref('/exams'));
  assert.ok(isInternalHref(examPath('정보처리기사')));
  assert.ok(!isInternalHref('https://www.q-net.or.kr/'));
  assert.ok(!isInternalHref('//cdn.example.com/x'));
  assert.ok(!isInternalHref('mailto:a@b.c'));
});
