/**
 * 사전 렌더의 순수 절반 — 문자열과 경로만 다룬다.
 *
 * `scripts/prerender.mjs` 에서 갈라낸 이유는 규칙 9 다. 저쪽은 `dist/` 를 읽는데
 * `dist/` 는 `.gitignore` 대상이라 CI 에 없다. 거기를 읽는 테스트는 로컬에서만 돌고
 * CI 에서는 조용히 통과한다 — 실제로 크롤 테스트 16건이 그렇게 몇 주를 놀았다.
 * 그래서 검증할 수 있는 것을 전부 이쪽으로 옮기고, 픽스처는 테스트 파일 안에 둔다.
 */

/** `index.html` 에 심어 둔 경계. 정규식으로 임의의 HTML 을 훑지 않는다 */
export const HEAD_START = '<!--head:start-->';
export const HEAD_END = '<!--head:end-->';
export const APP_MARK = '<!--app-->';
export const PAYLOAD_ID = '__exammoa';

/**
 * Windows 가 파일명으로 받지 않는 글자가 있는가.
 *
 * 하이픈과 공백은 막지 않는다 — 실측 slug 에 하이픈이 들어 있어서 막으면 멀쩡한
 * 종목이 빌드를 세운다. 제어문자는 정규식 대신 문자 코드로 본다. 정규식에 넣으면
 * 소스 파일에 진짜 제어문자가 박혀 git 과 grep 이 이 파일을 바이너리로 취급한다.
 */
function hasBadChar(name) {
  if (/[<>:"/\\|?*]/.test(name)) return true;
  for (const ch of name) if (ch.charCodeAt(0) < 32) return true;
  return false;
}
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** 자바스크립트 문자열 리터럴에서 줄바꿈으로 취급되는 두 글자 */
const LINE_SEP = String.fromCharCode(0x2028);
const PARA_SEP = String.fromCharCode(0x2029);

export class PrerenderError extends Error {}

/**
 * `</script>` 로 페이로드를 탈출하지 못하게 한다.
 *
 * `<` 를 통째로 `<` 로 바꾼다. JSON 문자열 리터럴 안에서 그 이스케이프는
 * 적법하므로 브라우저의 `JSON.parse` 는 아무 영향을 받지 않는다. `</script` 만
 * 노리고 바꾸면 `<!--` 로 시작하는 주석 탈출이 남는다.
 *
 * U+2028·U+2029 는 JSON 에는 들어갈 수 있는데 인라인 스크립트 안에서는 줄바꿈으로
 * 읽혀 문법을 깨뜨린다.
 */
export function serializeJson(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll(LINE_SEP, '\\u2028')
    .replaceAll(PARA_SEP, '\\u2029');
}

/** `<title>` 과 `<meta>` 를 만든다 */
export function headTags(head) {
  const esc = s => String(s)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

  const tags = [
    `<title>${esc(head.title)}</title>`,
    `<meta name="description" content="${esc(head.description)}" />`,
    `<link rel="canonical" href="${esc(head.canonical)}" />`,
    `<meta property="og:title" content="${esc(head.title)}" />`,
    `<meta property="og:description" content="${esc(head.description)}" />`,
    `<meta property="og:url" content="${esc(head.canonical)}" />`,
    `<meta property="og:type" content="website" />`,
  ];
  if (head.robots) tags.push(`<meta name="robots" content="${esc(head.robots)}" />`);
  if (head.jsonLd) {
    tags.push(`<script type="application/ld+json">${serializeJson(head.jsonLd)}</script>`);
  }
  return tags.join('\n    ');
}

/**
 * 표시 자체까지 먹어 치운다. 빌드 표시가 배포되는 HTML 에 남을 이유가 없고,
 * 남겨 두면 `checkPage` 가 "표시가 그대로 남았다" 를 영영 참으로 본다.
 *
 * 두 번 부르면 던진다. 그것이 옳다 — 이미 채운 자리를 다시 채우려 한다는 뜻이다.
 */
function replaceBetween(html, start, end, replacement, what) {
  const from = html.indexOf(start);
  const to = html.indexOf(end);
  if (from === -1 || to === -1 || to < from) {
    throw new PrerenderError(`index.html 에서 ${what} 표시를 찾지 못했습니다 (${start} … ${end})`);
  }
  return html.slice(0, from) + replacement + html.slice(to + end.length);
}

export function injectHead(html, head) {
  return replaceBetween(html, HEAD_START, HEAD_END, `\n    ${headTags(head)}\n    `, 'head');
}

export function injectApp(html, appHtml, payload) {
  const at = html.indexOf(APP_MARK);
  if (at === -1) throw new PrerenderError(`index.html 에서 ${APP_MARK} 표시를 찾지 못했습니다`);
  const script = `<script id="${PAYLOAD_ID}" type="application/json">${serializeJson(payload)}</script>`;
  return html.slice(0, at) + appHtml + html.slice(at + APP_MARK.length) + '\n' + script;
}

/**
 * 경로 → 쓸 파일. 디렉터리 이름은 **디코드한 NFC 한글**이다.
 *
 * 정적 호스트는 요청 경로를 퍼센트 디코드한 뒤 파일을 찾으므로 이쪽이 맞는다.
 * 인코딩된 이름으로 저장하면 한 번만 디코드하는 호스트에서 404 가 난다.
 *
 * NFC 정규화가 핵심이다. macOS 는 파일명을 조합형으로 저장하는데 우리 slug 는
 * 완성형이라, 정규화하지 않으면 눈에 똑같은 주소가 404 가 된다.
 */
export function outPathFor(routePath) {
  if (routePath === '/') return 'index.html';

  const segments = routePath.replace(/^\/+/, '').split('/').map(seg => {
    let decoded;
    try {
      decoded = decodeURIComponent(seg);
    } catch {
      throw new PrerenderError(`경로 세그먼트를 디코드하지 못했습니다: ${seg}`);
    }
    const nfc = decoded.normalize('NFC');
    if (!nfc) throw new PrerenderError(`빈 경로 세그먼트: ${routePath}`);
    if (nfc === '.' || nfc === '..') throw new PrerenderError(`상위 경로 탈출: ${routePath}`);
    if (hasBadChar(nfc)) throw new PrerenderError(`파일명에 쓸 수 없는 글자: ${nfc}`);
    if (RESERVED.test(nfc)) throw new PrerenderError(`Windows 예약 이름: ${nfc}`);
    return nfc;
  });

  return [...segments, 'index.html'].join('/');
}

/** 사이트맵 */
export function sitemapXml(origin, paths, lastmod) {
  const base = origin.replace(/\/+$/, '');
  const urls = paths.map(p => {
    // 경로는 이미 퍼센트 인코딩돼 있다. XML 에서 & 만 더 막으면 된다.
    const loc = `${base}${p}`.replaceAll('&', '&amp;');
    return `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod></url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

/**
 * 쓴 결과가 쓸 만한지 확인한다.
 *
 * **이 함수가 이 기능의 안전장치다.** 규칙 10 이 말한 실패 형태가 그대로 적용된다 —
 * 위험한 결과는 크래시가 아니라 **68개 파일이 성공적으로 비어 있는 것**이다.
 * 크롤 파서가 성공적으로 0건을 돌려주는 것과 같은 일이 렌더에서도 일어난다.
 */
export function checkPage({ path, html, mustContain = [], minBytes = 2000 }) {
  const problems = [];
  const bytes = Buffer.byteLength(html, 'utf8');
  if (bytes < minBytes) problems.push(`${path}: ${bytes}바이트로 너무 작습니다`);
  if (html.includes(APP_MARK)) problems.push(`${path}: ${APP_MARK} 가 그대로 남았습니다`);
  if (html.includes(HEAD_START)) problems.push(`${path}: head 표시가 그대로 남았습니다`);
  if (!html.includes('<title>')) problems.push(`${path}: title 이 없습니다`);
  if (!html.includes('rel="canonical"')) problems.push(`${path}: canonical 이 없습니다`);
  for (const needle of mustContain) {
    if (!html.includes(needle)) problems.push(`${path}: "${needle}" 가 본문에 없습니다`);
  }
  return problems;
}
