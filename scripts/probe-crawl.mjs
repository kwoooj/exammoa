#!/usr/bin/env node
// 타기관 시험 일정 페이지가 크롤링 가능한지 검증한다. 의존성 없음. Node 18+.
//
//   node scripts/probe-crawl.mjs              전체 검증
//   node scripts/probe-crawl.mjs toeic        특정 그룹만 (id 부분일치)
//   node scripts/probe-crawl.mjs --save       받은 HTML 을 build/crawl/ 에 저장
//
// 판정 기준
//   SSR 가능    초기 HTML 에 2026 날짜가 여러 개 들어있다 → 단순 fetch + 파싱으로 수집 가능
//   JS 필요     HTML 은 왔지만 날짜가 없다 → 헤드리스 브라우저가 필요하거나 XHR 엔드포인트를 찾아야 한다
//   차단·실패   응답이 없거나 오류

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const ARGS = process.argv.slice(2);
const SAVE = ARGS.includes('--save');
const FILTER = ARGS.find(a => !a.startsWith('--'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

async function get(url) {
  const t0 = Date.now();
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*', 'Accept-Language': 'ko-KR,ko;q=0.9' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const ctype = res.headers.get('content-type') ?? '';
  // 대한상의 등 일부 사이트는 EUC-KR 이다. 잘못 디코딩하면 날짜 탐지가 실패한다.
  let charset = (ctype.match(/charset=([\w-]+)/i)?.[1] ?? '').toLowerCase();
  let html = buf.toString('utf8');
  if (!charset) {
    const meta = html.slice(0, 2000).match(/charset=["']?([\w-]+)/i)?.[1];
    if (meta) charset = meta.toLowerCase();
  }
  if (charset && !/utf-?8/.test(charset)) {
    try { html = new TextDecoder(charset).decode(buf); } catch { /* 지원 안 되면 utf8 유지 */ }
  }
  return { status: res.status, finalUrl: res.url, ctype, charset: charset || '(미표기)', html, bytes: buf.length, ms: Date.now() - t0 };
}

function analyze(html) {
  const dates = [
    ...html.matchAll(/20(2[5-9])[.\-/년]\s?(\d{1,2})[.\-/월]\s?(\d{1,2})/g),
    ...html.matchAll(/\b20(2[5-9])(\d{2})(\d{2})\b/g),
  ];
  const y2026 = (html.match(/2026/g) ?? []).length;
  const tables = [...html.matchAll(/<table[\s>]/gi)].length;
  const scripts = [...html.matchAll(/<script[\s>]/gi)].length;
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const textLen = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
  const spa = /__NEXT_DATA__|id="app"|id="root"|window\.__NUXT__|ng-version/.test(html);
  return { dateCount: dates.length, y2026, tables, scripts, textLen, spa, sample: dates.slice(0, 6).map(m => m[0]) };
}

function firstTableHead(html) {
  const t = html.match(/<table[\s\S]{0,6000}?<\/table>/i)?.[0];
  if (!t) return null;
  const cells = [...t.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)]
    .map(m => m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 10);
  return cells.length ? cells : null;
}

const robotsCache = new Map();
async function robots(url) {
  const origin = new URL(url).origin;
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  let out;
  try {
    const r = await fetch(`${origin}/robots.txt`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) out = { ok: false, note: `HTTP ${r.status}` };
    else {
      const txt = await r.text();
      if (txt.trimStart().startsWith('<')) out = { ok: false, note: 'HTML 반환 (robots.txt 없음)' };
      else {
        const lines = txt.split('\n').map(l => l.trim());
        let inStar = false;
        const dis = [];
        for (const l of lines) {
          const ua = l.match(/^user-agent:\s*(.*)$/i);
          if (ua) { inStar = ua[1].trim() === '*'; continue; }
          const d = l.match(/^disallow:\s*(.*)$/i);
          if (d && inStar) dis.push(d[1].trim());
        }
        out = { ok: true, disallow: dis, raw: txt.slice(0, 300) };
      }
    }
  } catch (e) {
    out = { ok: false, note: String(e.name === 'TimeoutError' ? '타임아웃' : e.message).slice(0, 60) };
  }
  robotsCache.set(origin, out);
  return out;
}

function allowed(rob, url) {
  if (!rob.ok) return '판단 불가';
  const path = new URL(url).pathname;
  if (rob.disallow.includes('/')) return '전체 금지';
  const hit = rob.disallow.find(d => d && path.startsWith(d));
  return hit ? `금지 (${hit})` : '허용';
}

function verdict(a, status) {
  if (status >= 400) return `차단·실패 (HTTP ${status})`;
  if (a.dateCount >= 6) return 'SSR 가능';
  if (a.dateCount >= 2) return 'SSR 가능 (날짜 적음 — 구조 확인 필요)';
  if (a.y2026 >= 3) return 'SSR 의심 (2026 은 있는데 날짜 패턴 불일치 — 표기 형식 확인)';
  if (a.spa || a.textLen < 800) return 'JS 필요 (SPA 또는 빈 셸)';
  return 'JS 필요 (날짜 없음)';
}

const manual = JSON.parse(await readFile('data/manual-schedules.json', 'utf8'));
const targets = manual.groups
  .filter(g => g.sourceUrl)
  .filter(g => !FILTER || g.id.includes(FILTER));

console.log(`\n타기관 일정 페이지 크롤링 가능성 검증 — ${targets.length}곳\n`);
const results = [];

for (const g of targets) {
  console.log(`── ${g.name}  (${g.agency})`);
  console.log(`   ${g.sourceUrl}`);
  const rob = await robots(g.sourceUrl);
  try {
    const r = await get(g.sourceUrl);
    const a = analyze(r.html);
    const v = verdict(a, r.status);
    const head = firstTableHead(r.html);

    console.log(`   HTTP ${r.status} · ${(r.bytes / 1024).toFixed(0)}KB · ${r.ms}ms · charset ${r.charset}`);
    if (r.finalUrl !== g.sourceUrl) console.log(`   ⇢ 리다이렉트: ${r.finalUrl}`);
    console.log(`   날짜 패턴 ${a.dateCount}개 · '2026' ${a.y2026}회 · table ${a.tables} · script ${a.scripts} · 본문 ${a.textLen}자${a.spa ? ' · SPA 흔적' : ''}`);
    if (a.sample.length) console.log(`   날짜 예: ${a.sample.join(', ')}`);
    if (head) console.log(`   첫 표 헤더: ${head.join(' | ')}`);
    console.log(`   robots.txt: ${allowed(rob, g.sourceUrl)}${rob.ok && rob.disallow.length ? ` (Disallow: ${rob.disallow.slice(0, 5).join(', ')})` : rob.ok ? '' : ` — ${rob.note}`}`);
    console.log(`   ▶ ${v}\n`);

    results.push({ id: g.id, name: g.name, url: g.sourceUrl, status: r.status, charset: r.charset,
      dateCount: a.dateCount, tables: a.tables, textLen: a.textLen, spa: a.spa,
      robots: allowed(rob, g.sourceUrl), verdict: v, tableHead: head });

    if (SAVE) {
      await mkdir('build/crawl', { recursive: true });
      await writeFile(`build/crawl/${g.id}.html`, r.html, 'utf8');
    }
  } catch (e) {
    const reason = e.name === 'TimeoutError' ? '타임아웃 20s' : String(e.message).slice(0, 80);
    console.log(`   ▶ 차단·실패 — ${reason}`);
    console.log(`   robots.txt: ${allowed(rob, g.sourceUrl)}\n`);
    results.push({ id: g.id, name: g.name, url: g.sourceUrl, verdict: `차단·실패 (${reason})`, robots: allowed(rob, g.sourceUrl) });
  }
  await new Promise(r => setTimeout(r, 400));
}

const by = (k) => results.filter(r => r.verdict.startsWith(k));
console.log('=== 요약 ===');
for (const k of ['SSR 가능', 'SSR 의심', 'JS 필요', '차단·실패']) {
  const list = by(k);
  if (list.length) console.log(`${k} (${list.length}): ${list.map(r => r.name).join(', ')}`);
}
const blocked = results.filter(r => r.robots.startsWith('금지') || r.robots === '전체 금지');
if (blocked.length) console.log(`\n⚠ robots.txt 금지 경로: ${blocked.map(r => `${r.name}(${r.robots})`).join(', ')} — 자동수집 대상에서 제외할 것`);

await mkdir('build', { recursive: true });
await writeFile('build/crawl-report.json', JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2), 'utf8');
console.log('\nbuild/crawl-report.json 저장');
if (SAVE) console.log('build/crawl/*.html 저장 — 구조 확인용');
