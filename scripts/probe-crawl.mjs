#!/usr/bin/env node
// 기관 일정 페이지가 크롤링 가능한지 검증한다. 의존성 없음. Node 18+.
//
//   node scripts/probe-crawl.mjs              수집 후보 전체 검증
//   node scripts/probe-crawl.mjs toeic        특정 그룹만 (id 부분일치)
//   node scripts/probe-crawl.mjs --all        수집 대상이 아닌 그룹의 robots 도 함께 확인
//   node scripts/probe-crawl.mjs --save       받은 HTML 을 build/crawl/ 에 저장
//
// **robots.txt 를 먼저 읽고, 금지된 곳은 페이지를 받지 않는다.** 이전 버전은 페이지를
// 먼저 받고 robots 를 나중에 보고해서, 금지된 기관의 페이지를 실제로 가져왔다.
// 진단 도구가 준수 요구사항(FR-DAT-11)을 어기면 도구 자체가 위험이 된다.
//
// 대상 목록은 data/groups.seed.json 에서 읽는다. 진단과 수집이 '어느 URL 이 정본인가' 로
// 불일치할 수 없게 하려는 것이다.
//
// 판정 기준
//   SSR 가능    표 안에 대상 연도 날짜가 여러 개 → fetch + 파싱으로 수집 가능
//   JS 필요     HTML 은 왔지만 날짜가 없다 → 헤드리스 또는 XHR 엔드포인트 필요
//   robots 금지 자동 수집 대상이 아니다. 페이지를 받지 않았다
//   차단·실패   응답이 없거나 오류

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const ARGS = process.argv.slice(2);
const SAVE = ARGS.includes('--save');
const ALL = ARGS.includes('--all');
const FILTER = ARGS.find(a => !a.startsWith('--'));
const YEAR = Number(process.env.PROBE_YEAR ?? new Date().getFullYear());
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

// ---- robots.txt --------------------------------------------------------

const robotsCache = new Map();

/**
 * RFC 9309 §2.3.1 의 상태 분류를 그대로 따른다.
 *
 *   2xx        → 파싱
 *   4xx (429 제외) → "Unavailable". robots.txt 가 없는 것과 같으므로 전면 허용
 *   429 · 5xx  → "Unreachable". 일시적 전면 금지로 해석하고 보류
 *   빈 본문     → 규칙 없음 = 전면 허용
 *
 * 이전 버전은 !res.ok 를 전부 '판단 불가' 로 뭉갰다. 그래서 robots.txt 가 없는
 * 한국사능력검정시험(최우선 크롤 대상)과 403 을 주는 ihd.or.kr(리눅스마스터)이
 * 판단 불가로 표시됐고, 보수적 게이트를 걸면 값어치 있는 대상을 스스로 차단하게 된다.
 *
 * 403 을 허용으로 보는 것이 위험해 보일 수 있는데, RFC 와 주요 크롤러 구현이 그렇게
 * 정의한다. robots.txt 를 못 읽는 것과 '금지한다고 적혀 있는 것' 은 다르다.
 */
async function robotsFor(url) {
  const origin = new URL(url).origin;
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  let out;
  try {
    const r = await fetch(`${origin}/robots.txt`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10000),
    });
    if (r.status === 429 || r.status >= 500) {
      out = { state: 'hold', rules: [], note: `HTTP ${r.status} → 일시적 전면 금지로 해석 (RFC 9309)` };
    } else if (r.status >= 400) {
      out = { state: 'allow-all', rules: [], note: `HTTP ${r.status} → robots.txt 없음과 동일, 전면 허용 (RFC 9309)` };
    } else {
      const txt = await r.text();
      if (!txt.trim()) {
        out = { state: 'allow-all', rules: [], note: '본문이 비어 규칙 없음 → 전면 허용' };
      } else if (txt.trimStart().startsWith('<')) {
        // HTML 을 주는 서버는 robots.txt 가 없는 것과 같다
        out = { state: 'allow-all', rules: [], note: 'HTML 반환 (robots.txt 없음) → 전면 허용' };
      } else {
        const rules = parseRobots(txt);
        out = rules.length
          ? { state: 'parsed', rules, note: null, raw: txt.slice(0, 200) }
          : { state: 'allow-all', rules: [], note: 'User-agent: * 규칙 없음 → 전면 허용' };
      }
    }
  } catch (e) {
    // 네트워크 실패는 '금지되어 있지 않다' 는 증거가 아니다. 보수적으로 보류한다.
    const why = e.name === 'TimeoutError' ? '타임아웃' : String(e.message).slice(0, 60);
    out = { state: 'hold', rules: [], note: `요청 실패 (${why}) → 보류` };
  }
  robotsCache.set(origin, out);
  return out;
}

/** `User-agent: *` 그룹의 Allow / Disallow 를 순서대로 모은다 */
export function parseRobots(txt) {
  const rules = [];
  let inStar = false;
  for (const raw of txt.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const ua = line.match(/^user-agent:\s*(.*)$/i);
    if (ua) { inStar = ua[1].trim() === '*'; continue; }
    if (!inStar) continue;
    const m = line.match(/^(allow|disallow):\s*(.*)$/i);
    if (m) rules.push({ allow: m[1].toLowerCase() === 'allow', path: m[2].trim() });
  }
  return rules;
}

/**
 * 최장일치 우선. `*` 와일드카드와 `$` 앵커를 지원한다.
 * 빈 Disallow 는 '금지 없음' 이므로 규칙에서 제외한다.
 */
export function matchLen(pattern, path) {
  if (pattern === '') return -1;
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = new RegExp(
    '^' + body.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (anchored ? '$' : ''),
  );
  return re.test(path) ? body.length : -1;
}

export function verdictRobots(rob, url) {
  if (rob.state === 'allow-all') return { ok: true, label: '허용', detail: rob.note };
  if (rob.state === 'hold') return { ok: false, label: '보류', detail: rob.note };
  if (rob.state === 'unknown') return { ok: false, label: '판단 불가', detail: rob.note };

  const path = new URL(url).pathname + (new URL(url).search || '');
  let best = { len: -1, allow: true };
  for (const r of rob.rules) {
    const len = matchLen(r.path, path);
    // 같은 길이면 Allow 가 이긴다 (RFC 9309)
    if (len > best.len || (len === best.len && len >= 0 && r.allow)) best = { len, allow: r.allow };
  }
  if (best.len < 0) return { ok: true, label: '허용', detail: '일치하는 규칙 없음' };
  return best.allow
    ? { ok: true, label: '허용', detail: `Allow 최장일치 ${best.len}자` }
    : { ok: false, label: '금지', detail: `Disallow 최장일치 ${best.len}자` };
}

// ---- fetch -------------------------------------------------------------

const CHARSET_ALIAS = { cp949: 'euc-kr', 'ks_c_5601-1987': 'euc-kr', ksc5601: 'euc-kr', korean: 'euc-kr' };

/**
 * meta refresh 와 frameset 을 따라간다.
 *
 * redirect:'follow' 는 HTTP 3xx 만 따라간다. ihd.or.kr 루트는 185바이트 meta refresh 셸이고
 * license.kacpta.or.kr 은 818바이트 frameset 인데 둘 다 HTTP 200 이라, 이전 버전은 셸을
 * 그대로 분석해 'JS 필요 (빈 셸)' 로 오판했다.
 */
async function get(url, { hops = 3, visited = new Set(), chain = [] } = {}) {
  const t0 = Date.now();
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*', 'Accept-Language': 'ko-KR,ko;q=0.9' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const ctype = res.headers.get('content-type') ?? '';

  let charset = (ctype.match(/charset=([\w-]+)/i)?.[1] ?? '').toLowerCase();
  if (!charset) {
    // latin1 로 스니핑한다. EUC-KR 바이트를 utf8 로 읽으면 U+FFFD 가 섞여
    // meta 태그 자체를 놓칠 수 있다.
    const head = buf.subarray(0, 4096).toString('latin1');
    charset = (head.match(/charset=["']?([\w-]+)/i)?.[1] ?? '').toLowerCase();
  }
  charset = CHARSET_ALIAS[charset] ?? charset;

  let html = decode(buf, charset || 'utf-8');
  // charset 미표기인데 대체문자가 많으면 EUC-KR 로 재시도한다. 국내 기관 사이트에 흔하다
  if (!charset && replacementRatio(html) > 0.002) {
    const alt = decode(buf, 'euc-kr');
    if (replacementRatio(alt) < replacementRatio(html)) html = alt;
  }

  const here = [...chain, url];
  const next = followTarget(html, res.url);
  if (next && hops > 0 && !visited.has(next)) {
    visited.add(next);
    return get(next, { hops: hops - 1, visited, chain: here });
  }

  return {
    status: res.status,
    finalUrl: res.url,
    charset: charset || '(미표기)',
    html,
    bytes: buf.length,
    ms: Date.now() - t0,
    chain: here,
  };
}

function decode(buf, charset) {
  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    return buf.toString('utf8');
  }
}

const replacementRatio = (s) => (s.length ? (s.match(/�/g) ?? []).length / s.length : 0);

/** meta refresh 목적지 또는 frameset 의 본문 프레임 */
export function followTarget(html, baseUrl) {
  const meta = html.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]*>/i)?.[0];
  if (meta) {
    const content = meta.match(/content=["']?\s*(\d+)\s*;\s*url=([^"'>\s]+)/i);
    // 지연이 긴 refresh 는 '잠시 후 이동' 안내라 본문이 따로 있다. 5초 이하만 따라간다
    if (content && Number(content[1]) <= 5) return abs(content[2], baseUrl);
  }

  const fs = html.match(/<frameset[\s\S]*?<\/frameset>/i)?.[0];
  if (fs) {
    const frames = [...fs.matchAll(/<frame\b[^>]*>/gi)].map(m => m[0]);
    // cols="0,100%" 처럼 폭 0 인 프레임은 껍데기다. 이름으로도 한 번 걸러낸다
    const dims = (fs.match(/(?:cols|rows)=["']?([^"'>]+)/i)?.[1] ?? '').split(',').map(s => s.trim());
    const scored = frames.map((f, i) => {
      const src = f.match(/src=["']?([^"'>\s]+)/i)?.[1];
      const name = (f.match(/name=["']?([^"'>\s]+)/i)?.[1] ?? '').toLowerCase();
      const dim = dims[i] ?? '';
      const zero = /^0%?$/.test(dim);
      const named = /body|main|content/.test(name);
      return { src, score: (zero ? -10 : 0) + (named ? 5 : 0) + (dim.includes('%') ? 1 : 0) };
    }).filter(x => x.src);
    scored.sort((a, b) => b.score - a.score);
    if (scored.length) return abs(scored[0].src, baseUrl);
  }
  return null;
}

function abs(href, base) {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

// ---- 분석 -------------------------------------------------------------

// 연도가 붙은 표기
const WITH_YEAR = /(20[2-9]\d)\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/g;
const COMPACT = /(?<!\d)(20[2-9]\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?!\d)/g;
// 연도 없는 표기. 한국 시험표의 기본형이다. 연도는 제목에 한 번만 적힌다.
// 버전번호·전화번호·가격을 날짜로 오인하지 않으려면 요일 또는 범위 문맥이 필요하다.
const BARE_DOW = /(?<![\d.])(0?[1-9]|1[0-2])\s*[.\-/월]\s*(0?[1-9]|[12]\d|3[01])\s*[.일]?\s*\(\s*[월화수목금토일]\s*\)/g;
const BARE_RANGE = /(?<![\d.])(0?[1-9]|1[0-2])\.(0?[1-9]|[12]\d|3[01])\s*[~\-–]\s*(?:(0?[1-9]|1[0-2])\.)?(0?[1-9]|[12]\d|3[01])(?![\d.])/g;

const stripScripts = (html) =>
  html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');

const countAll = (s, ...res) => res.reduce((n, re) => n + [...s.matchAll(re)].length, 0);

export function analyze(html, year) {
  // 날짜는 script·style 을 걷어낸 뒤에 센다. 이전 버전은 본문 길이만 걷어내고
  // 날짜는 원본에서 세서 JS 안의 데이터가 섞여 들어갔다.
  const clean = stripScripts(html);
  const tables = [...clean.matchAll(/<table[\s\S]*?<\/table>/gi)].map(m => m[0]);
  const tableHtml = tables.join('\n');

  const withYear = countAll(clean, WITH_YEAR, COMPACT);
  const bare = countAll(clean, BARE_DOW, BARE_RANGE);
  // 표 안의 날짜가 실제 수집 가능성과 훨씬 잘 상관한다. 푸터 공지 날짜는 일정이 아니다.
  const inTable = countAll(tableHtml, WITH_YEAR, COMPACT, BARE_DOW, BARE_RANGE);

  const yearHits = (clean.match(new RegExp(String(year), 'g')) ?? []).length;
  const text = clean.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const spa = /__NEXT_DATA__|id="app"|id="root"|window\.__NUXT__|ng-version/.test(html);

  const sample = [
    ...[...clean.matchAll(WITH_YEAR)].slice(0, 3).map(m => m[0].trim()),
    ...[...clean.matchAll(BARE_DOW)].slice(0, 3).map(m => m[0].trim()),
  ];

  return {
    withYear, bare, inTable, yearHits,
    tableCount: tables.length,
    scripts: [...html.matchAll(/<script[\s>]/gi)].length,
    textLen: text.length,
    spa,
    sample,
  };
}

export function verdict(a, status, year) {
  if (status >= 400) return `차단·실패 (HTTP ${status})`;
  if (a.inTable >= 6) return 'SSR 가능';
  if (a.withYear >= 6) return 'SSR 가능 (표 밖 날짜 — 구조 확인 필요)';
  if (a.bare >= 6) return 'SSR 가능 (연도 없는 표기 — 제목에서 연도 상속 필요)';
  if (a.inTable >= 2 || a.withYear >= 2 || a.bare >= 2) return 'SSR 가능 (날짜 적음 — 구조 확인 필요)';
  if (a.yearHits >= 3) return `SSR 의심 (${year} 은 있는데 날짜 패턴 불일치)`;
  if (a.spa || a.textLen < 800) return 'JS 필요 (SPA 또는 빈 셸)';
  return 'JS 필요 (날짜 없음)';
}

function firstTableHead(html) {
  const t = stripScripts(html).match(/<table[\s\S]{0,8000}?<\/table>/i)?.[0];
  if (!t) return null;
  const cells = [...t.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)]
    .map(m => m[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;| /g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 10);
  return cells.length ? cells : null;
}

// ---- 실행 -------------------------------------------------------------
//
// 직접 실행할 때만 돈다. 테스트가 이 모듈을 import 해도 네트워크를 타지 않게 하려는 것이다.

if (import.meta.filename === process.argv[1]) await main();

async function main() {
const groupSeed = JSON.parse(await readFile('data/groups.seed.json', 'utf8'));

// 수집 후보 = sourceUrl 이 있는 그룹. robots 가 금지한 기관은 애초에 sourceUrl 이 없다.
const candidates = groupSeed.groups
  .filter(g => g.sourceUrl)
  .map(g => ({ ...g, url: g.sourceUrl, kind: 'candidate' }));

// --all 이면 수집 대상이 아닌 그룹도 robots 만 확인한다. 페이지는 받지 않는다.
const others = ALL
  ? groupSeed.groups.filter(g => !g.sourceUrl && g.agencyUrl).map(g => ({ ...g, url: g.agencyUrl, kind: 'excluded' }))
  : [];

const targets = [...candidates, ...others].filter(g => !FILTER || g.id.includes(FILTER));

console.log(`\n기관 일정 페이지 크롤링 가능성 검증 — ${targets.length}곳 · 대상연도 ${YEAR}`);
console.log(`대상 목록 출처: data/groups.seed.json (sourceUrl 보유 ${candidates.length}곳${ALL ? ` + robots 확인만 ${others.length}곳` : ''})\n`);

const results = [];

for (const g of targets) {
  console.log(`── ${g.name}  (${g.agency})`);
  console.log(`   ${g.url}`);

  // robots 를 먼저 본다. 금지면 페이지를 받지 않는다.
  const rob = await robotsFor(g.url);
  const allowed = verdictRobots(rob, g.url);
  console.log(`   robots.txt: ${allowed.label}${allowed.detail ? ` — ${allowed.detail}` : ''}`);

  if (g.kind === 'excluded') {
    console.log(`   ▶ 수집 대상 아님 (collect: ${g.collect}) — 페이지를 받지 않음\n`);
    results.push({ id: g.id, name: g.name, url: g.url, robots: allowed.label, verdict: `수집 대상 아님 (${g.collect})` });
    await sleep(300);
    continue;
  }

  if (!allowed.ok) {
    console.log(`   ▶ robots 금지 — 페이지를 받지 않았다. 자동 수집 대상에서 제외할 것\n`);
    results.push({ id: g.id, name: g.name, url: g.url, robots: allowed.label, verdict: 'robots 금지 (요청 안 함)' });
    await sleep(300);
    continue;
  }

  try {
    const r = await get(g.url);
    const a = analyze(r.html, YEAR);
    const v = verdict(a, r.status, YEAR);
    const head = firstTableHead(r.html);

    console.log(`   HTTP ${r.status} · ${(r.bytes / 1024).toFixed(0)}KB · ${r.ms}ms · charset ${r.charset}`);
    if (r.chain.length > 1) console.log(`   ⇢ 이동: ${r.chain.slice(1).join(' → ')}`);
    console.log(`   날짜 표 안 ${a.inTable} · 연도포함 ${a.withYear} · 연도없음 ${a.bare} · '${YEAR}' ${a.yearHits}회`);
    console.log(`   table ${a.tableCount} · script ${a.scripts} · 본문 ${a.textLen}자${a.spa ? ' · SPA 흔적' : ''}`);
    if (a.sample.length) console.log(`   날짜 예: ${a.sample.join(', ')}`);
    if (head) console.log(`   첫 표 헤더: ${head.join(' | ')}`);
    console.log(`   ▶ ${v}\n`);

    results.push({
      id: g.id, name: g.name, url: g.url, status: r.status, charset: r.charset,
      chain: r.chain.length > 1 ? r.chain : undefined,
      inTable: a.inTable, withYear: a.withYear, bare: a.bare,
      tableCount: a.tableCount, textLen: a.textLen, spa: a.spa,
      robots: allowed.label, verdict: v, tableHead: head,
    });

    if (SAVE) {
      await mkdir('build/crawl', { recursive: true });
      await writeFile(`build/crawl/${g.id}.html`, r.html, 'utf8');
    }
  } catch (e) {
    const reason = e.name === 'TimeoutError' ? '타임아웃 20s' : String(e.message).slice(0, 80);
    console.log(`   ▶ 차단·실패 — ${reason}\n`);
    results.push({ id: g.id, name: g.name, url: g.url, robots: allowed.label, verdict: `차단·실패 (${reason})` });
  }
  await sleep(500);
}

console.log('=== 요약 ===');
for (const k of ['SSR 가능', 'SSR 의심', 'JS 필요', 'robots 금지', '수집 대상 아님', '차단·실패']) {
  const list = results.filter(r => r.verdict.startsWith(k));
  if (list.length) console.log(`${k} (${list.length}): ${list.map(r => r.name).join(', ')}`);
}

const notAllowed = results.filter(r => r.robots !== '허용');
if (notAllowed.length) {
  console.log(`\n⚠ robots 가 허용하지 않는 곳: ${notAllowed.map(r => `${r.name}(${r.robots})`).join(', ')}`);
  console.log('  이 목록의 기관은 sourceUrl 을 두지 않는다. agencyUrl 로만 링크한다.');
}

await mkdir('build', { recursive: true });
await writeFile('build/crawl-report.json', JSON.stringify({ checkedAt: new Date().toISOString(), year: YEAR, results }, null, 2), 'utf8');
console.log('\nbuild/crawl-report.json 저장');
if (SAVE) console.log('build/crawl/*.html 저장 — 구조 확인용');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
