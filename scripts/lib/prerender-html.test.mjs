// node --test scripts/lib/prerender-html.test.mjs
//
// 픽스처는 전부 이 파일 안에 있다. 사전 렌더의 산출물은 gitignore 대상 디렉터리에
// 있어서 CI 에 없고, 거기를 읽는 테스트는 로컬에서만 돌고 CI 에서는 조용히
// 통과한다 (규칙 9).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_MARK,
  HEAD_START,
  PAYLOAD_ID,
  PrerenderError,
  checkPage,
  headTags,
  injectApp,
  injectHead,
  outPathFor,
  serializeJson,
  sitemapXml,
} from './prerender-html.mjs';

/** 실제 index.html 과 같은 모양의 최소 템플릿 */
const TEMPLATE = [
  '<!doctype html>',
  '<html lang="ko">',
  '  <head>',
  '    <meta charset="UTF-8" />',
  '    <!--head:start-->',
  '    <title>시험모아</title>',
  '    <!--head:end-->',
  '    <script type="module" src="/assets/index-abc123.js"></script>',
  '  </head>',
  '  <body>',
  '    <div id="root"><!--app--></div>',
  '  </body>',
  '</html>',
].join('\n');

const HEAD = {
  title: '정보처리기사 2026 시험일정·원서접수 | 시험모아',
  description: '한국산업인력공단 시행 정보처리기사의 실기 원서접수 일정은 2026.09.21 ~ 10.19 입니다.',
  canonical: 'https://exammoa.example/exam/%EC%A0%95%EB%B3%B4%EC%B2%98%EB%A6%AC%EA%B8%B0%EC%82%AC',
};

// ---- serializeJson -----------------------------------------------------

test('페이로드가 script 태그를 탈출하지 못한다', () => {
  const out = serializeJson({ evil: '</script><script>alert(1)</script>' });
  assert.ok(!out.includes('</script'), out);
  assert.ok(!out.toLowerCase().includes('<script'), out);
});

test('주석 탈출도 막는다', () => {
  // </script 만 노리고 바꾸면 <!-- 로 시작하는 탈출이 남는다.
  const out = serializeJson({ evil: '<!--' });
  assert.ok(!out.includes('<!--'), out);
});

test('이스케이프해도 JSON 으로 되읽힌다', () => {
  const value = { name: '정보처리기사', evil: '</script>', nested: { a: [1, 2] } };
  assert.deepEqual(JSON.parse(serializeJson(value)), value);
});

test('줄바꿈으로 읽히는 유니코드 두 글자를 막는다', () => {
  // JSON 에는 들어갈 수 있는데 인라인 스크립트 안에서는 문법을 깨뜨린다.
  const value = { a: `x${String.fromCharCode(0x2028)}y${String.fromCharCode(0x2029)}z` };
  const out = serializeJson(value);
  assert.ok(!out.includes(String.fromCharCode(0x2028)));
  assert.ok(!out.includes(String.fromCharCode(0x2029)));
  assert.deepEqual(JSON.parse(out), value);
});

test('한글은 그대로 둔다', () => {
  assert.ok(serializeJson({ a: '정보처리기사' }).includes('정보처리기사'));
});

// ---- headTags ----------------------------------------------------------

test('제목·설명·canonical 을 낸다', () => {
  const tags = headTags(HEAD);
  assert.ok(tags.includes(`<title>${HEAD.title}</title>`));
  assert.ok(tags.includes('name="description"'));
  assert.ok(tags.includes(`<link rel="canonical" href="${HEAD.canonical}" />`));
});

test('따옴표와 꺾쇠를 이스케이프한다', () => {
  const tags = headTags({ ...HEAD, description: '따옴표 " 와 <b> 와 & 가 든 설명' });
  assert.ok(tags.includes('&quot;'), tags);
  assert.ok(tags.includes('&lt;b&gt;'), tags);
  assert.ok(tags.includes('&amp;'), tags);
  // content 속성이 조기에 닫히지 않아야 한다
  assert.ok(!/content="[^"]*"[^/>]*"/.test(tags), tags);
});

test('robots 는 있을 때만 붙는다', () => {
  assert.ok(!headTags(HEAD).includes('name="robots"'));
  assert.ok(headTags({ ...HEAD, robots: 'noindex, follow' }).includes('noindex, follow'));
});

test('구조화 데이터는 있을 때만 붙고 안전하게 직렬화된다', () => {
  assert.ok(!headTags(HEAD).includes('ld+json'));
  const tags = headTags({ ...HEAD, jsonLd: { '@type': 'Event', name: '</script>' } });
  assert.ok(tags.includes('application/ld+json'));
  assert.ok(!tags.includes('name":"</script>'), tags);
});

// ---- injectHead / injectApp -------------------------------------------

test('head 표시 사이를 갈아 끼운다', () => {
  const out = injectHead(TEMPLATE, HEAD);
  assert.ok(out.includes(HEAD.title));
  assert.ok(!out.includes('<title>시험모아</title>'), '기본 제목이 남았다');
  // 자산 스크립트는 건드리지 않는다
  assert.ok(out.includes('/assets/index-abc123.js'));
});

test('본문과 페이로드를 심는다', () => {
  const out = injectApp(TEMPLATE, '<h1>정보처리기사</h1>', { buildDate: '2026-08-14' });
  assert.ok(out.includes('<h1>정보처리기사</h1>'));
  assert.ok(!out.includes(APP_MARK));
  assert.ok(out.includes(`id="${PAYLOAD_ID}"`));
  assert.ok(out.includes('"buildDate":"2026-08-14"'));
});

test('두 주입이 서로를 지우지 않는다', () => {
  const out = injectApp(injectHead(TEMPLATE, HEAD), '<h1>정보처리기사</h1>', { a: 1 });
  assert.ok(out.includes(HEAD.title));
  assert.ok(out.includes('<h1>정보처리기사</h1>'));
});

test('표시가 없으면 조용히 넘어가지 않고 던진다', () => {
  // 조용히 넘어가면 68개의 빈 페이지가 성공적으로 만들어진다.
  assert.throws(() => injectHead('<html></html>', HEAD), PrerenderError);
  assert.throws(() => injectApp('<html></html>', '<h1>x</h1>', {}), PrerenderError);
});

test('표시가 뒤집혀 있어도 던진다', () => {
  const broken = TEMPLATE.replace('<!--head:start-->', 'X').replace('<!--head:end-->', '<!--head:start-->');
  assert.throws(() => injectHead(broken, HEAD), PrerenderError);
});

// ---- outPathFor --------------------------------------------------------

test('루트는 index.html 이다', () => {
  assert.equal(outPathFor('/'), 'index.html');
});

test('정적 라우트는 디렉터리 하나를 만든다', () => {
  assert.equal(outPathFor('/exams'), 'exams/index.html');
  assert.equal(outPathFor('/404'), '404/index.html');
});

test('한글 slug 를 디코드해 디렉터리 이름으로 쓴다', () => {
  // 정적 호스트가 요청 경로를 디코드한 뒤 파일을 찾으므로 이쪽이 맞는다.
  const encoded = `/exam/${encodeURIComponent('정보처리기사')}`;
  assert.equal(outPathFor(encoded), 'exam/정보처리기사/index.html');
});

test('조합형으로 들어와도 완성형으로 저장한다', () => {
  const nfd = '정보처리기사'.normalize('NFD');
  assert.equal(outPathFor(`/exam/${encodeURIComponent(nfd)}`), 'exam/정보처리기사/index.html');
});

test('하이픈이 든 slug 를 막지 않는다', () => {
  // 실측 slug 에 들어 있다. 막으면 멀쩡한 종목이 빌드를 세운다.
  assert.equal(outPathFor('/exam/a-b'), 'exam/a-b/index.html');
});

test('영숫자 slug 도 그대로', () => {
  assert.equal(outPathFor('/exam/SQLD'), 'exam/SQLD/index.html');
  assert.equal(outPathFor('/exam/ADsP'), 'exam/ADsP/index.html');
  assert.equal(outPathFor(`/exam/${encodeURIComponent('컴퓨터활용능력1급')}`), 'exam/컴퓨터활용능력1급/index.html');
});

test('파일명에 쓸 수 없는 글자는 빌드를 세운다', () => {
  for (const bad of ['a<b', 'a>b', 'a:b', 'a"b', 'a|b', 'a?b', 'a*b']) {
    assert.throws(() => outPathFor(`/exam/${encodeURIComponent(bad)}`), PrerenderError, bad);
  }
});

test('Windows 예약 이름을 거절한다', () => {
  for (const bad of ['con', 'PRN', 'aux', 'NUL', 'com1', 'lpt9']) {
    assert.throws(() => outPathFor(`/exam/${bad}`), PrerenderError, bad);
  }
});

test('상위 경로로 탈출하지 못한다', () => {
  assert.throws(() => outPathFor('/exam/..'), PrerenderError);
  assert.throws(() => outPathFor('/exam/.'), PrerenderError);
});

test('깨진 퍼센트 시퀀스에 던진다', () => {
  assert.throws(() => outPathFor('/exam/%ZZ'), PrerenderError);
});

test('빈 세그먼트에 던진다', () => {
  assert.throws(() => outPathFor('/exam//x'), PrerenderError);
});

// ---- sitemapXml --------------------------------------------------------

test('사이트맵에 모든 주소가 들어간다', () => {
  const xml = sitemapXml('https://exammoa.example', ['/', '/exams', '/exam/SQLD'], '2026-08-14');
  assert.ok(xml.startsWith('<?xml'));
  assert.equal((xml.match(/<url>/g) ?? []).length, 3);
  assert.ok(xml.includes('<loc>https://exammoa.example/exams</loc>'));
  assert.ok(xml.includes('<lastmod>2026-08-14</lastmod>'));
});

test('origin 뒤 슬래시를 겹치지 않는다', () => {
  assert.ok(sitemapXml('https://exammoa.example/', ['/exams'], '2026-08-14')
    .includes('<loc>https://exammoa.example/exams</loc>'));
});

test('XML 에서 & 를 이스케이프한다', () => {
  const xml = sitemapXml('https://x.example', ['/a?b=1&c=2'], '2026-08-14');
  assert.ok(xml.includes('&amp;c=2'), xml);
  assert.ok(!/[^&]&[^a]/.test(xml.split('<loc>')[1].split('</loc>')[0]));
});

// ---- checkPage (안전장치) ----------------------------------------------

const filled = injectApp(injectHead(TEMPLATE, HEAD), `<h1>정보처리기사</h1>${'x'.repeat(2500)}`, { a: 1 });

test('제대로 만들어진 페이지는 문제가 없다', () => {
  assert.deepEqual(checkPage({ path: '/exam/정보처리기사', html: filled, mustContain: ['정보처리기사'] }), []);
});

test('빈 페이지를 잡는다', () => {
  // 위험한 결과는 크래시가 아니라 68개 파일이 성공적으로 비어 있는 것이다.
  const problems = checkPage({ path: '/x', html: '<html></html>' });
  assert.ok(problems.some(p => p.includes('너무 작습니다')), problems.join('\n'));
});

test('표시가 남은 페이지를 잡는다', () => {
  const problems = checkPage({ path: '/x', html: TEMPLATE + 'x'.repeat(3000) });
  assert.ok(problems.some(p => p.includes(APP_MARK)), problems.join('\n'));
  assert.ok(problems.some(p => p.includes('head 표시')), problems.join('\n'));
});

test('제목이나 canonical 이 빠진 페이지를 잡는다', () => {
  const noHead = injectApp(TEMPLATE, 'x'.repeat(3000), { a: 1 }).replace(HEAD_START, '');
  const problems = checkPage({ path: '/x', html: noHead });
  assert.ok(problems.some(p => p.includes('canonical')), problems.join('\n'));
});

test('본문에 있어야 할 글자가 없으면 잡는다', () => {
  // 이 검사가 없으면 "성공적으로 렌더된 빈 페이지" 를 통과시킨다.
  const problems = checkPage({ path: '/exam/토익', html: filled, mustContain: ['토익'] });
  assert.ok(problems.some(p => p.includes('토익')), problems.join('\n'));
});
