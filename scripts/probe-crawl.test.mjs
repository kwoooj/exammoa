// node --test scripts/
//
// robots 판정과 날짜 탐지의 회귀 테스트. 네트워크를 타지 않는다.
// robots 판정이 조용히 틀리면 금지된 기관의 페이지를 받게 되므로, 이 테스트가
// 없으면 준수 여부를 사람이 매번 눈으로 확인해야 한다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRobots, matchLen, verdictRobots, followTarget, analyze, verdict } from './probe-crawl.mjs';

const parsed = (txt) => ({ state: 'parsed', rules: parseRobots(txt), note: null });

// ---- robots 파싱 -------------------------------------------------------

test('User-agent: * 그룹의 규칙만 모은다', () => {
  const rules = parseRobots(`
User-agent: Googlebot
Disallow: /secret
User-agent: *
Disallow: /admin
Allow: /admin/public
`);
  assert.deepEqual(rules, [
    { allow: false, path: '/admin' },
    { allow: true, path: '/admin/public' },
  ]);
});

test('주석과 CRLF 를 처리한다', () => {
  assert.deepEqual(parseRobots('#robots.txt \r\n\r\nUser-agent: *\r\nDisallow: /kor/\r\n'), [
    { allow: false, path: '/kor/' },
  ]);
});

test('대문자 User-Agent 도 인식한다', () => {
  // cq.or.kr 실제 내용
  assert.deepEqual(parseRobots('User-Agent: *\nDisallow: /'), [{ allow: false, path: '/' }]);
});

// ---- 경로 매칭 ---------------------------------------------------------

test('빈 Disallow 는 규칙이 아니다', () => {
  assert.equal(matchLen('', '/any'), -1);
});

test('접두 일치 길이를 돌려준다', () => {
  assert.equal(matchLen('/kor/', '/kor/images/a.png'), 5);
  assert.equal(matchLen('/kor/', '/co/examschedule.do'), -1);
  assert.equal(matchLen('/', '/'), 1);
  assert.equal(matchLen('/', '/anything'), 1);
});

test('$ 앵커는 정확히 그 경로만 맞는다', () => {
  assert.equal(matchLen('/$', '/'), 1);
  assert.equal(matchLen('/$', '/www/accept/schedule.do'), -1);
});

test('* 와일드카드', () => {
  assert.equal(matchLen('/*.pdf', '/files/a.pdf'), 6);
  assert.equal(matchLen('/*.pdf', '/files/a.html'), -1);
});

// ---- 판정 -------------------------------------------------------------

test('Disallow: / 는 루트를 금지한다 (cq.or.kr)', () => {
  const v = verdictRobots(parsed('User-Agent: *\nDisallow: /'), 'https://www.cq.or.kr');
  assert.equal(v.ok, false);
  assert.equal(v.label, '금지');
});

test('Disallow: / 는 하위 경로도 금지한다', () => {
  const v = verdictRobots(parsed('User-Agent: *\nDisallow: /'), 'https://www.cq.or.kr/qh_quagm03_001.do');
  assert.equal(v.ok, false);
});

test('Disallow: / + Allow: /$ 는 루트만 허용한다 (dataq.or.kr)', () => {
  const txt = 'User-agent: *\r\nDisallow: /\r\nAllow: /$';
  const root = verdictRobots(parsed(txt), 'https://www.dataq.or.kr');
  assert.equal(root.ok, true, '루트는 허용되어야 한다');

  // 실제로 받고 싶었던 일정 페이지는 금지다. 루트가 허용이라고 착각하면 안 된다.
  const page = verdictRobots(parsed(txt), 'https://www.dataq.or.kr/www/accept/schedule.do');
  assert.equal(page.ok, false, '일정 페이지는 금지되어야 한다');
});

test('Disallow: /kor/ 는 다른 경로를 막지 않는다 (korcham)', () => {
  const txt = '#robots.txt\r\nUser-agent: *\r\nDisallow: /kor/';
  assert.equal(verdictRobots(parsed(txt), 'https://license.korcham.net/co/examschedule.do').ok, true);
  // 2026 달력 이미지는 /kor/ 아래라 금지다 (FR-DAT-11)
  assert.equal(
    verdictRobots(parsed(txt), 'https://license.korcham.net/kor/images/common/img_2026_examschedule01.png').ok,
    false,
  );
});

test('robots.txt 가 없으면 전면 허용이다 (RFC 9309)', () => {
  const v = verdictRobots({ state: 'allow-all', rules: [], note: '없음' }, 'https://www.historyexam.go.kr/x');
  assert.equal(v.ok, true);
  assert.equal(v.label, '허용');
});

test('5xx 는 보류로 처리한다', () => {
  assert.equal(verdictRobots({ state: 'hold', rules: [], note: '' }, 'https://x.kr/').ok, false);
});

test('같은 길이면 Allow 가 이긴다', () => {
  const v = verdictRobots(parsed('User-agent: *\nDisallow: /a\nAllow: /a'), 'https://x.kr/a');
  assert.equal(v.ok, true);
});

// ---- meta refresh / frameset -------------------------------------------

test('meta refresh 를 따라간다 (ihd.or.kr 실제 응답)', () => {
  const html = `<!DOCTYPE html><html><head>
   <meta http-equiv="refresh" content="0; url=/main.do">
</head></html><body></body></html>`;
  assert.equal(followTarget(html, 'https://www.ihd.or.kr/'), 'https://www.ihd.or.kr/main.do');
});

test('지연이 긴 refresh 는 안내 페이지라 따라가지 않는다', () => {
  const html = '<meta http-equiv="refresh" content="30; url=/bye">';
  assert.equal(followTarget(html, 'https://x.kr/'), null);
});

test('frameset 의 본문 프레임을 고른다 (kacpta 실제 응답)', () => {
  const html = `<frameset cols="0,100%" frameborder="0">
    <frame name="blank" id="blank" src="top.htm" scrolling="no">
    <frame name="body" id="body" src="/web/home/Default.aspx" scrolling="yes">
  </frameset>`;
  assert.equal(
    followTarget(html, 'https://license.kacta.or.kr/'),
    'https://license.kacta.or.kr/web/home/Default.aspx',
  );
});

test('평범한 페이지는 이동 대상이 없다', () => {
  assert.equal(followTarget('<html><body><table><tr><td>1.5(월)</td></tr></table></body></html>', 'https://x.kr/'), null);
});

// ---- 날짜 탐지 ---------------------------------------------------------

test('연도 없는 M.D(요일) 을 센다 — 이 누락이 오탐 3건의 원인이었다', () => {
  const html = '<table><tr><td>1.26(월)<br>~1.29(목)</td><td>3.13(금)</td></tr></table>';
  const a = analyze(html, 2026);
  assert.ok(a.bare >= 3, `연도 없는 날짜를 세야 한다 (실제 ${a.bare})`);
  assert.ok(a.inTable >= 3, `표 안 날짜를 세야 한다 (실제 ${a.inTable})`);
});

test('연도 포함 표기도 센다', () => {
  const a = analyze('<table><tr><td>2026.08.09</td><td>2026년 1월 6일</td><td>20260809</td></tr></table>', 2026);
  assert.ok(a.withYear >= 3, `실제 ${a.withYear}`);
});

test('script 안의 날짜는 세지 않는다', () => {
  const a = analyze('<script>var d=["2026.01.01","2026.02.02","2026.03.03"]</script><p>없음</p>', 2026);
  assert.equal(a.withYear, 0);
});

test('버전번호와 전화번호를 날짜로 오인하지 않는다', () => {
  const a = analyze('<p>v1.26 버전 · 02-1234-5678 · 가격 1.5억</p>', 2026);
  assert.equal(a.bare, 0, '요일이나 범위 문맥이 없으면 날짜가 아니다');
});

test('표 안 날짜가 많으면 SSR 가능', () => {
  const cells = Array.from({ length: 8 }, (_, i) => `<td>${i + 1}.15(월)</td>`).join('');
  const a = analyze(`<table><tr>${cells}</tr></table>`, 2026);
  assert.equal(verdict(a, 200, 2026), 'SSR 가능');
});

test('빈 셸은 JS 필요', () => {
  const a = analyze('<html><body><div id="root"></div></body></html>', 2026);
  assert.ok(verdict(a, 200, 2026).startsWith('JS 필요'));
});

test('대상 연도를 인자로 받는다 — 하드코딩하면 내년에 무용해진다', () => {
  const html = '<p>2027 2027 2027</p>';
  assert.ok(verdict(analyze(html, 2027), 200, 2027).startsWith('SSR 의심'));
  assert.ok(verdict(analyze(html, 2026), 200, 2026).startsWith('JS 필요'));
});

// ---- 상태 코드 분류 (RFC 9309 §2.3.1) ---------------------------------

test('4xx 는 robots.txt 없음과 동일하게 전면 허용 — 403 을 주는 ihd.or.kr 이 이 경우다', () => {
  const v = verdictRobots(
    { state: 'allow-all', rules: [], note: 'HTTP 403 → 전면 허용' },
    'https://www.ihd.or.kr/guidecert1.do',
  );
  assert.equal(v.ok, true, '403 은 금지가 아니다. 못 읽는 것과 금지라고 적힌 것은 다르다');
});

test('429 와 5xx 는 보류 — 일시적 전면 금지로 해석한다', () => {
  for (const note of ['HTTP 429', 'HTTP 503']) {
    assert.equal(verdictRobots({ state: 'hold', rules: [], note }, 'https://x.kr/a').ok, false);
  }
});

test('네트워크 실패는 허용의 증거가 아니다 — 보류로 처리한다', () => {
  assert.equal(verdictRobots({ state: 'hold', rules: [], note: '타임아웃' }, 'https://x.kr/a').ok, false);
});

test('User-agent: * 그룹이 없으면 전면 허용', () => {
  // Googlebot 전용 규칙만 있는 경우, 우리에게 적용되는 규칙은 없다
  assert.deepEqual(parseRobots('User-agent: Googlebot\nDisallow: /'), []);
});
