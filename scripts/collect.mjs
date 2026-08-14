#!/usr/bin/env node
// Q-Net 국가자격 시험일정 수집 (공공데이터포털 15074408)
// 의존성 없음. Node 18+ 필요 (global fetch)
//
//   node scripts/collect.mjs --probe     첫 실행. 응답 형태와 미확인 4건을 진단만 함
//   node scripts/collect.mjs             수집 → build/sessions.json 생성
//
// 키는 환경변수로. 저장소에 커밋하지 말 것.
//   PowerShell:  $env:QNET_KEY="발급받은키"; node scripts/collect.mjs --probe
//   bash:        QNET_KEY="발급받은키" node scripts/collect.mjs --probe

import { readFile } from 'node:fs/promises';
import { readPrevious, mergeStale, writeAll, archive, PUBLISHED } from './lib/store.mjs';
import { classifyResponse, rejectionMessage, sourceHealth } from './lib/qnet.mjs';
import * as historyExam from './sources/history-exam.mjs';
import * as kbsKorean from './sources/kbs-korean.mjs';
import { toeic, toeicSpeaking } from './sources/ybm.mjs';
import * as dataqCsv from './sources/dataq-csv.mjs';
import * as kaitLinux from './sources/kait-linux.mjs';
import * as kacptaTax from './sources/kacpta-tax.mjs';
import { decodeResponse } from './lib/csv.mjs';

/** 크롤 어댑터 목록. 여기 없는 사이트는 요청되지 않는다. */
const CRAWL_SOURCES = [historyExam, toeic, toeicSpeaking, kbsKorean, kaitLinux, kacptaTax];

/**
 * 파일 소스. 네트워크를 타지 않는다.
 *
 * `observedAt` 은 파일의 **데이터 기준일**이다 (파일명의 20260106). 오늘로 쓰면 화면이
 * "최종 확인 오늘" 이라고 거짓말한다 — 갱신주기가 연간인 파일이다.
 */
const FILE_SOURCES = [
  {
    src: dataqCsv,
    path: 'data/dataq-2026.csv',
    observedAt: '2026-01-06T00:00:00.000Z',
    /**
     * 이 소스는 219일 된 것이 정상이다. 기본 임계(3일)로 재면 경고가 영구히 켜진다.
     * 400일로 잡은 근거: 차기등록예정일이 2027-01-22 이므로 그때까지는 이 파일이 최신이고,
     * 그 뒤로도 낡아 있으면 **연 1회 수기 갱신을 아무도 하지 않은 것**이다. 그게 잡고 싶은 실패다.
     */
    staleAfterDays: 400,
  },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

/** robots.txt 를 확인하고 허용되면 페이지를 받아 파싱한다. 금지면 요청하지 않는다. */
async function harvestCrawl(src, url, year) {
  const base = { id: src.id, method: src.method, sessions: [] };
  try {
    const origin = new URL(url).origin;
    const rob = await fetch(`${origin}/robots.txt`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10000),
    });
    // RFC 9309 — 4xx(429 제외)는 robots.txt 없음과 같다. 429·5xx 는 일시적 전면 금지.
    if (rob.status === 429 || rob.status >= 500) {
      return { ...base, ok: false, error: `robots.txt HTTP ${rob.status} → 보류` };
    }
    if (rob.status < 400) {
      const txt = await rob.text();
      // 전체 금지만 본다. 세밀한 판정은 probe-crawl.mjs 가 담당하고,
      // 여기서는 '금지된 곳을 절대 받지 않는다' 만 보장한다.
      if (/^\s*user-agent:\s*\*/im.test(txt) && /^\s*disallow:\s*\/\s*$/im.test(txt)) {
        return { ...base, ok: false, error: 'robots.txt 전체 금지 → 요청하지 않음' };
      }
    }

    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*', 'Accept-Language': 'ko-KR,ko;q=0.9' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { ...base, ok: false, error: `HTTP ${res.status}` };
    // res.text() 를 쓰지 않는다. Fetch 명세상 언제나 UTF-8 로 디코드하고
    // `Content-Type: charset=euc-kr` 을 무시한다 — 한국세무사회 페이지가 그렇게 깨졌다.
    const { text: html } = await decodeResponse(res, { expect: src.EXPECT_HEADERS?.[0] });

    const { sessions, diagnostics } = src.parse(html, { year });
    if (!diagnostics.headerMatch) {
      // 헤더가 사라진 것은 개편 신호다. 빈 결과를 조용히 게시하지 않는다.
      return { ...base, ok: false, error: '기대한 표 헤더를 찾지 못했다 (사이트 개편 가능)', rawHtml: html };
    }
    if (!sessions.length) {
      return { ...base, ok: false, error: '회차를 하나도 뽑지 못했다', rawHtml: html };
    }
    if (diagnostics.failures.length) {
      console.log(`     ⚠ ${src.id} 날짜 파싱 실패 ${diagnostics.failures.length}건:`);
      for (const f of diagnostics.failures.slice(0, 5)) {
        console.log(`       ${f.seq}회 ${f.label} — ${f.reason} ${JSON.stringify(f.raw)}`);
      }
    }
    return { ...base, ok: true, sessions, error: null, rawHtml: html, diagnostics };
  } catch (e) {
    const why = e.name === 'TimeoutError' ? '타임아웃' : String(e.message).slice(0, 80);
    return { ...base, ok: false, error: why };
  }
}

const ENDPOINT = 'https://apis.data.go.kr/B490007/qualExamSchd/getQualExamSchdList';
const KEY = process.env.QNET_KEY;
const YEAR = Number(process.env.QNET_YEAR ?? new Date().getFullYear());
const PROBE = process.argv.includes('--probe');
const DUMP = (process.argv.find(a => a.startsWith('--dump')) ?? '').split('=')[1] ?? (process.argv.includes('--dump') ? '1320' : null);
// 기본은 제한 없음. --limit= 는 디버깅용 오버라이드다.
// 예전 기본값 20 이 필터를 통과한 23종목을 다시 자르고 있었다 (3종목이 이유 없이 누락).
const LIMIT = Number((process.argv.find(a => a.startsWith('--limit=')) ?? '').split('=')[1] || Infinity);

if (!KEY) {
  console.error('QNET_KEY 환경변수가 없습니다.');
  process.exit(1);
}

// serviceKey는 이미 URL 인코딩된 상태(%3D%3D)로 발급된다.
// URLSearchParams를 쓰면 % 가 %25 로 이중 인코딩되어 SERVICE_KEY_IS_NOT_REGISTERED_ERROR 가 난다.
// 그래서 쿼리스트링을 직접 조립한다.
function buildUrl(params) {
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return `${ENDPOINT}?serviceKey=${KEY}&${qs}`;
}

// numOfRows 상한은 50. 초과하면 resultCode 930 으로 거절된다. (실측)
const MAX_ROWS = 50;

async function call({ implYy, jmCd, qualgbCd, rows = MAX_ROWS, page = 1, format = 'json' }) {
  if (rows > MAX_ROWS) rows = MAX_ROWS;
  const p = { implYy, numOfRows: rows, pageNo: page, dataFormat: format };
  if (jmCd) p.jmCd = jmCd;
  if (qualgbCd) p.qualgbCd = qualgbCd;
  const url = buildUrl(p);
  // 크롤 경로와 같은 수준의 타임아웃. 없으면 엔드포인트가 죽은 날 종목마다 OS 연결
  // 타임아웃(약 10.6초)을 다 기다려 47종목에 8분 48초가 걸린다 (실측).
  const res = await fetch(url, { headers: { Accept: '*/*' }, signal: AbortSignal.timeout(10000) });
  const text = await res.text();
  return { status: res.status, text, url: url.replace(KEY, '***') };
}

// 응답 구조가 문서에 명확치 않아, 객체를 순회해 implYy를 가진 레코드 배열을 찾는다.
function extractItems(text) {
  let root;
  try {
    root = JSON.parse(text);
  } catch {
    return { items: null, parsed: null, isXml: text.trimStart().startsWith('<') };
  }
  const found = [];
  const walk = (node) => {
    if (Array.isArray(node)) {
      if (node.length && node.every(x => x && typeof x === 'object' && 'implYy' in x)) found.push(node);
      else node.forEach(walk);
    } else if (node && typeof node === 'object') {
      if ('implYy' in node && 'qualgbCd' in node) found.push([node]);
      else Object.values(node).forEach(walk);
    }
  };
  walk(root);
  return { items: found.flat(), parsed: root, isXml: false };
}

/** header 는 최상위(`{header:{...}}`)에 오기도 하고 `{response:{header:{...}}}` 로 감싸이기도 한다. */
function headerOf(parsed) {
  return parsed?.header ?? parsed?.response?.header ?? null;
}

function resultMessage(parsed, text) {
  if (!parsed) {
    const m = text.match(/<returnAuthMsg>(.*?)<\/returnAuthMsg>|<errMsg>(.*?)<\/errMsg>|<resultMsg>(.*?)<\/resultMsg>/);
    return m ? (m[1] || m[2] || m[3]) : null;
  }
  const h = headerOf(parsed);
  return h ? `${h.resultCode} ${h.resultMsg}` : null;
}

/** resultCode 가 성공을 뜻하지 않으면 사유 문자열, 성공이면 null */
function errorOf(parsed, text) {
  // 거절(cmmMsgHeader)이 먼저다. header/resultCode 구조가 아니라서 아래 검사를 통과해 버린다.
  const rejected = rejectionMessage(parsed, text);
  if (rejected) return rejected;
  const h = headerOf(parsed);
  if (!h) return parsed ? null : `JSON 파싱 실패 — ${text.slice(0, 200)}`;
  const code = String(h.resultCode ?? '');
  const ok = ['00', '0', '000', 'INFO-000', 'INFO-00'].includes(code);
  return ok ? null : `${code} ${h.resultMsg ?? ''}`.trim();
}

// ---- 정규화: 원본 10개 날짜 필드 → events[] ----------------------------

const isBlank = (v) => v == null || String(v).trim() === '' || /^0+$/.test(String(v).trim());
const toIso = (v) => (isBlank(v) ? null : `${String(v).slice(0, 4)}-${String(v).slice(4, 6)}-${String(v).slice(6, 8)}`);

function eventsOf(raw) {
  const unified = raw.qualgbCd === 'C' || raw.qualgbCd === 'W';
  const out = [];
  const add = (kind, phase, s, e, label) => {
    const start = toIso(s);
    if (!start) return;
    out.push({ kind, phase: unified ? 'single' : phase, start, end: toIso(e) ?? start, seq: 1, label, note: null });
  };
  add('reg', 'written', raw.docRegStartDt, raw.docRegEndDt, '필기 원서접수');
  add('exam', 'written', raw.docExamStartDt, raw.docExamEndDt, '필기시험');
  add('result', 'written', raw.docPassDt, null, '필기 합격발표');
  add('reg', 'practical', raw.pracRegStartDt, raw.pracRegEndDt, '실기 원서접수');
  add('exam', 'practical', raw.pracExamStartDt, raw.pracExamEndDt, '실기시험');
  add('result', 'practical', raw.pracPassDt, null, '최종 합격발표');
  return out;
}

/**
 * 같은 (implYy, implSeq) 레코드가 여러 건 온다 (필기행·실기행 분리).
 * 회차 하나를 Session 하나로 합치고, 이벤트는 (kind, phase, start, end) 기준으로 중복 제거한다.
 * 어느 행이 어느 필드를 담는지에 의존하지 않으므로 분리 방식이 바뀌어도 깨지지 않는다.
 */
const REG_LABEL = { written: '필기', practical: '실기', single: '' };

function normalizeGroup(rows) {
  const head = rows[0];
  const seen = new Set();
  const buckets = new Map(); // "kind:phase" → 서로 다른 날짜 구간들
  const contradictions = [];

  for (const raw of rows) {
    for (const ev of eventsOf(raw)) {
      const key = `${ev.kind}:${ev.phase}:${ev.start}:${ev.end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const bk = `${ev.kind}:${ev.phase}`;
      if (!buckets.has(bk)) buckets.set(bk, []);
      buckets.get(bk).push(ev);
    }
  }

  const events = [];
  for (const [bk, list] of buckets) {
    list.sort((a, b) => a.start.localeCompare(b.start));
    const [kind, phase] = bk.split(':');

    if (list.length === 1) { events.push(list[0]); continue; }

    if (kind === 'reg') {
      // 같은 회차에 접수 구간이 여럿이면 정기접수 / 빈자리접수다. (실측: 1320 은 3회차 모두 2건)
      // 앞선 구간이 정기(seq 1), 시험 직전 짧은 구간이 빈자리(seq 2+).
      list.forEach((ev, i) => {
        events.push({
          ...ev,
          seq: i + 1,
          label: i === 0
            ? `${REG_LABEL[phase]} 원서접수`.trim()
            : `${REG_LABEL[phase]} 빈자리접수`.trim(),
          note: i === 0 ? null : '빈자리접수',
        });
      });
      continue;
    }

    // 접수가 아닌데 날짜가 갈리면 실제 모순이다. 조용히 하나를 버리지 않는다.
    contradictions.push({ kind, phase, ranges: list.map(e => [e.start, e.end]) });
    events.push(...list);
  }

  events.sort((a, b) => a.start.localeCompare(b.start) || a.seq - b.seq);
  const descriptions = [...new Set(rows.map(r => r.description).filter(Boolean))];

  // id 와 groupId 는 여기서 붙이지 않는다. 그룹 접기(foldGroups)가 종목별 일정을
  // 비교한 뒤에 붙여야 하기 때문이다.
  return {
    year: Number(head.implYy),
    seq: head.implSeq == null ? null : Number(head.implSeq),
    label: descriptions[0] ?? null,
    mode: 'scheduled',
    status: events.length ? 'confirmed' : 'tbd',
    events,
    ...(rows.length > 1 ? { sourceRows: rows.length } : {}),
    ...(descriptions.length > 1 ? { labels: descriptions } : {}),
    ...(contradictions.length ? { contradictions } : {}),
  };
}

/** 레코드 배열을 (implYy, implSeq) 로 묶는다 */
function groupRows(items) {
  const groups = new Map();
  for (const it of items) {
    const k = `${it.implYy}-${it.implSeq ?? 0}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  return [...groups.values()];
}

// ---- 그룹 접기 ---------------------------------------------------------
//
// 일정의 주체는 종목이 아니라 시행그룹이다. 실측: 47종목을 수집했더니 서로 다른
// 일정이 7개뿐이었고 그중 하나에 29종목이 몰려 있었다. 종목별로 행을 만들면
// 같은 막대가 29줄 그려지고 정보량이 0이 된다.

/** 이벤트 배열의 지문 */
function signature(events) {
  return events.map(e => `${e.kind}:${e.phase}:${e.start}:${e.end}:${e.seq}`).join('|');
}

/** 한 종목의 연간 일정 전체 지문. 회차 순서에 의존하지 않게 정렬해서 만든다. */
function examSignature(sessions) {
  return sessions.map(s => `${s.seq ?? 0}=${signature(s.events)}`).sort().join('#');
}

/**
 * 종목별 회차를 그룹 단위로 접는다.
 *
 * groupId 는 시드에 **선언**된 값이고, 이 함수가 하는 일은 그 선언이 사실인지 **검증**하는
 * 것이다. 지문을 그룹 id 로 쓰지 않는 이유: 회차가 바뀔 때마다 id 가 흔들려 URL 공유와
 * ExamPlan.sessionId 가 깨진다.
 *
 * 같은 그룹 종목들의 일정이 갈리면 조용히 하나를 고르지 않는다. 지문별로 쪼개고
 * splits 에 기록한다. 기관이 일정을 분리했다는 유일한 신호다.
 */
function foldGroups(perExam) {
  const byGroup = new Map();
  for (const m of perExam) {
    if (!byGroup.has(m.exam.groupId)) byGroup.set(m.exam.groupId, []);
    byGroup.get(m.exam.groupId).push(m);
  }

  const sessions = [];
  const splits = [];

  for (const [groupId, members] of byGroup) {
    const bySig = new Map();
    for (const m of members) {
      const sig = examSignature(m.sessions);
      if (!bySig.has(sig)) bySig.set(sig, []);
      bySig.get(sig).push(m);
    }
    const variants = [...bySig.values()];

    if (variants.length > 1) {
      splits.push({
        groupId,
        variantCount: variants.length,
        variants: variants.map(v => ({
          groupId: `${groupId}--${v[0].exam.slug}`,
          examSlugs: v.map(m => m.exam.slug),
          sessionCount: v[0].sessions.length,
        })),
      });
    }

    for (const variant of variants) {
      // 갈리지 않았으면 선언된 groupId 그대로. 갈렸으면 대표 종목 slug 를 붙여 구분한다.
      const gid = variants.length === 1 ? groupId : `${groupId}--${variant[0].exam.slug}`;
      const rep = variant[0];
      for (const s of rep.sessions) {
        sessions.push({
          id: `${gid}-${s.year}-${s.seq ?? 'x'}`,
          groupId: gid,
          year: s.year,
          seq: s.seq,
          label: s.label,
          mode: s.mode,
          status: s.status,
          events: s.events,
          ...(s.sourceRows ? { sourceRows: s.sourceRows } : {}),
          ...(s.labels ? { labels: s.labels } : {}),
          ...(s.contradictions ? { contradictions: s.contradictions } : {}),
        });
      }
    }
  }

  sessions.sort((a, b) => a.groupId.localeCompare(b.groupId) || (a.seq ?? 0) - (b.seq ?? 0));
  return { sessions, splits };
}

/**
 * 발행할 그룹 목록. 시드의 그룹 정의에 이번 수집 결과를 덧붙인다.
 * 수집 대상이 아닌 그룹(타기관·상시·v0 제외)도 그대로 내보낸다 —
 * 화면이 시행기관 이름을 표시해야 하고(NFR-REL-02), 그룹이 목록에서 사라지면 안 된다.
 */
function buildGroups(groupSeed, sessions, splits) {
  const counts = new Map();
  for (const s of sessions) counts.set(s.groupId, (counts.get(s.groupId) ?? 0) + 1);
  const splitBy = new Map(splits.map(s => [s.groupId, s]));

  const out = [];
  for (const g of groupSeed.groups) {
    const split = splitBy.get(g.id);
    if (!split) {
      out.push({ ...g, sessionCount: counts.get(g.id) ?? 0 });
      continue;
    }
    // 갈린 그룹은 변종마다 행을 낸다. 원래 그룹 id 는 남기지 않는다 (세션이 없으므로).
    for (const v of split.variants) {
      out.push({
        ...g,
        id: v.groupId,
        name: `${g.name} · ${v.examSlugs[0]} 계열`,
        examSlugs: v.examSlugs,
        sessionCount: counts.get(v.groupId) ?? 0,
        note: `${g.note ?? ''} / 실측에서 일정이 갈려 분리됨 (${split.variantCount}개 변종)`.trim(),
      });
    }
  }
  return out;
}

// ---- 진단 모드 ---------------------------------------------------------

async function probe(seed) {
  console.log(`\n=== Q-Net API 진단 (${YEAR}년) ===\n`);

  console.log('[1] 응답 형태 — jmCd=1320 정보처리기사');
  const a = await call({ implYy: YEAR, jmCd: '1320' });
  console.log(`    HTTP ${a.status}`);
  const { items, parsed } = extractItems(a.text);
  const msg = resultMessage(parsed, a.text);
  if (msg) console.log(`    결과 메시지: ${msg}`);
  const err = errorOf(parsed, a.text);
  if (err) {
    console.log(`\n    API가 오류를 반환했습니다: ${err}`);
    console.log('    원본 앞 600자:\n');
    console.log(a.text.slice(0, 600).replace(/^/gm, '      '));
    return;
  }
  if (!items || !items.length) {
    console.log('    오류는 없지만 레코드를 못 찾았습니다. 원본 앞 1200자:\n');
    console.log(a.text.slice(0, 1200).replace(/^/gm, '      '));
    console.log('\n    → 이 출력을 그대로 붙여주시면 파서를 맞추겠습니다.');
    return;
  }
  console.log(`    회차 ${items.length}건`);
  console.log(`    필드: ${Object.keys(items[0]).join(', ')}`);
  console.log('\n    첫 레코드:');
  for (const [k, v] of Object.entries(items[0])) {
    console.log(`      ${k.padEnd(18)} ${JSON.stringify(v)}`);
  }

  console.log('\n[2] 미정 날짜 표기 방식');
  const blanks = new Set();
  for (const it of items) {
    for (const [k, v] of Object.entries(it)) {
      if (/Dt$/.test(k) && isBlank(v)) blanks.add(JSON.stringify(v));
    }
  }
  console.log(blanks.size ? `    빈 값의 실제 표현: ${[...blanks].join(', ')}` : '    빈 날짜 필드 없음 (전 회차 확정)');

  console.log('\n[3] 종목당 연간 회차 수');
  const groups = groupRows(items);
  console.log(`    레코드 ${items.length}건 → 회차 ${groups.length}개 (같은 implSeq 는 필기행·실기행 분리)`);
  for (const g of groups) {
    console.log(`      ${g[0].implYy}-${g[0].implSeq}회 : 레코드 ${g.length}건`);
  }
  const merged = groups.map(g => normalizeGroup(g));
  console.log(`    병합 후 이벤트: ${merged.map(m => m.events.length).join(', ')} (회차당)`);
  const bad = merged.filter(m => m.contradictions);
  if (bad.length) {
    console.log(`    ⚠ 같은 kind+phase 에 서로 다른 날짜를 주장하는 회차 ${bad.length}건:`);
    for (const m of bad) for (const c of m.contradictions) {
      // normalizeGroup 은 {kind, phase, ranges} 를 만든다. c.a / c.b 는 존재하지 않는다.
      console.log(`      ${m.seq}회 ${c.kind}/${c.phase}: ${c.ranges.map(r => r.join('~')).join(' vs ')}`);
    }
  } else {
    console.log('    모순 없음 — 두 행의 날짜가 일치하거나 상호 보완적');
  }
  const spans = merged.flatMap(m => m.events.filter(e => e.kind === 'exam'))
    .map(e => ({ ...e, days: (new Date(e.end) - new Date(e.start)) / 86400000 + 1 }));
  const longSpans = spans.filter(s => s.days > 3);
  if (longSpans.length) {
    console.log(`    시험 기간이 3일을 넘는 이벤트 ${longSpans.length}건 (점이 아니라 막대로 렌더):`);
    for (const s of longSpans) console.log(`      ${s.label} ${s.start}~${s.end} (${s.days}일)`);
  }

  console.log('\n[4] 타기관 시행 종목 응답 유무');
  for (const [code, name] of [['0492', '컴퓨터활용능력 1급'], ['1324', '빅데이터분석기사'], ['1325', '정보보안기사']]) {
    const r = await call({ implYy: YEAR, jmCd: code });
    const p = extractItems(r.text);
    const e = errorOf(p.parsed, r.text);
    const n = p.items?.length ?? 0;
    const verdict = e ? `오류 (${e})` : n ? `${n}회차 (T1로 승격 가능)` : '응답 없음 (별도 처리 필요)';
    console.log(`    ${code} ${name.padEnd(14)} → ${verdict}`);
  }

  console.log('\n[5] 과거 연도 조회');
  const past = await call({ implYy: YEAR - 2, jmCd: '1320' });
  const pp = extractItems(past.text);
  const pe = errorOf(pp.parsed, past.text);
  const pn = pp.items?.length ?? 0;
  console.log(`    implYy=${YEAR - 2} → ${pe ? `오류 (${pe})` : pn ? `${pn}회차 (아카이브 여유 있음)` : '응답 없음 (지금 받는 것을 보존해야 함)'}`);

  console.log('\n[6] 전 종목 일괄 조회 가능성 (jmCd 없이 qualgbCd=T)');
  const all = await call({ implYy: YEAR, qualgbCd: 'T' });
  const ap = extractItems(all.text);
  const ae = errorOf(ap.parsed, all.text);
  const an = ap.items?.length ?? 0;
  const total = ap.parsed?.body?.totalCount ?? ap.parsed?.response?.body?.totalCount ?? ap.parsed?.totalCount ?? null;
  if (ae) console.log(`    오류 (${ae})`);
  else console.log(`    ${an}건 수신${total != null ? ` / 전체 ${total}건` : ''} → ${total != null && total > an ? '페이징 필요' : '1회로 충분'}`);
  console.log('    ※ 응답에 종목 식별자가 없으므로 일괄 조회로는 종목 귀속이 불가능하다.');
  console.log('      회차 수 파악과 페이징 설계 확인용으로만 본다.');

  console.log(`\n대상 종목 ${pickExams(seed).length}개로 수집 예정. 이어서:  node scripts/collect.mjs\n`);
}

// ---- 덤프 모드 --------------------------------------------------------
// implSeq 가 중복되는 원인을 찾기 위해 전 레코드를 표로 출력한다.

async function dump(code) {
  const r = await call({ implYy: YEAR, jmCd: code });
  const { items, parsed } = extractItems(r.text);
  const e = errorOf(parsed, r.text);
  if (e) { console.log(`오류: ${e}`); return; }
  if (!items?.length) { console.log('레코드 없음'); return; }

  const cols = ['implSeq', 'qualgbCd', 'docRegStartDt', 'docRegEndDt', 'docExamStartDt', 'docExamEndDt',
                'docPassDt', 'pracRegStartDt', 'pracRegEndDt', 'pracExamStartDt', 'pracExamEndDt', 'pracPassDt'];
  const short = { implSeq: '회차', qualgbCd: '구분', docRegStartDt: '필기접수시', docRegEndDt: '필기접수종',
    docExamStartDt: '필기시험시', docExamEndDt: '필기시험종', docPassDt: '필기발표',
    pracRegStartDt: '실기접수시', pracRegEndDt: '실기접수종', pracExamStartDt: '실기시험시',
    pracExamEndDt: '실기시험종', pracPassDt: '최종발표' };
  const md = v => (v && String(v).length === 8 ? `${String(v).slice(4, 6)}/${String(v).slice(6, 8)}` : String(v ?? '-'));

  console.log(`\njmCd=${code} · ${YEAR}년 · ${items.length}건\n`);
  console.log('  ' + cols.map(c => (short[c] ?? c).padEnd(c === 'implSeq' || c === 'qualgbCd' ? 4 : 6)).join(' '));
  for (const it of items) {
    console.log('  ' + cols.map(c => md(it[c]).padEnd(c === 'implSeq' || c === 'qualgbCd' ? 4 : 6)).join(' '));
  }

  console.log('\ndescription:');
  items.forEach((it, i) => console.log(`  [${i}] ${JSON.stringify(it.description)}`));

  // 회차가 중복되면 무엇이 다른지 짚어준다
  const groups = new Map();
  for (const it of items) {
    const k = `${it.implYy}-${it.implSeq}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  const dups = [...groups.entries()].filter(([, v]) => v.length > 1);
  if (!dups.length) { console.log('\n회차 중복 없음. id 규칙 그대로 사용 가능.'); return; }

  console.log(`\n회차 중복 ${dups.length}쌍. 쌍별로 값이 다른 필드:`);
  for (const [k, group] of dups) {
    const diff = Object.keys(group[0]).filter(f => new Set(group.map(g => JSON.stringify(g[f]))).size > 1);
    console.log(`  ${k} (${group.length}건) → ${diff.length ? diff.join(', ') : '⚠ 모든 필드가 동일 (완전 중복)'}`);
  }
}

// ---- 수집 -------------------------------------------------------------

/**
 * Q-Net API 로 받을 수 있는 종목.
 *
 * priority 필터는 걸지 않는다. 실측(build/api-coverage.json)에서 jmCd 보유 53종목 중
 * 47종목이 정상 응답했고, 응답 0건인 6종목(1324·1325·0492·0493·0488·0483)은
 * 전부 타기관 시행이라 아래 tier X / rolling 조건에서 이미 걸러진다.
 * 별도 블랙리스트가 필요 없다.
 */
function pickExams(seed) {
  return seed.exams
    .filter(e => e.jmCd && !e.rolling && (e.tier === 'T1' || e.tier === 'T2'))
    .sort((a, b) => a.priority - b.priority || a.category.localeCompare(b.category))
    .slice(0, LIMIT);
}

async function collect(seed, groupSeed) {
  const exams = pickExams(seed);
  const declared = new Set(groupSeed.groups.map(g => g.id));
  const orphans = exams.filter(e => !e.groupId || !declared.has(e.groupId));
  if (orphans.length) {
    console.error(`groupId 가 없거나 groups.seed.json 에 없는 종목 ${orphans.length}건:`);
    for (const e of orphans) console.error(`  ${e.slug} → ${e.groupId ?? '(없음)'}`);
    process.exit(1);
  }

  console.log(`${exams.length}종목 수집 (${YEAR}년) · 선언된 그룹 ${new Set(exams.map(e => e.groupId)).size}개\n`);
  // 종목당 1회 호출을 유지한다. 응답에 종목 식별자가 없어 일괄 조회로는 귀속이 불가능하고,
  // 이 중복이 그룹 무결성 검사(foldGroups)를 공짜로 준다.
  const perExam = [];
  const failed = [];
  const raw = {};
  const crawlRaw = {};

  // 계정 단위로 막혔을 때 채운다. 채워지면 남은 종목을 호출하지 않는다.
  let sourceFailure = null;
  /**
   * 연속 네트워크 실패. 엔드포인트가 통째로 죽은 날을 종목별 실패로 세지 않는다.
   *
   * 실측: 정부 도메인 점검 시간에 걸린 배치가 47종목 전부 `fetch failed` 를 받고
   * 종목마다 타임아웃을 기다려 8분 48초를 썼다. 죽은 서버를 47번 두드리는 것은
   * 무의미하고 무례하다. 계정 단위 거절(#18)과 같은 판단이되 신호가 다르다.
   */
  let consecutiveNetworkErrors = 0;
  const NETWORK_GIVE_UP = 5;

  for (const exam of exams) {
    try {
      const r = await call({ implYy: YEAR, jmCd: exam.jmCd });
      consecutiveNetworkErrors = 0;
      const { items, parsed } = extractItems(r.text);
      const verdict = classifyResponse({ status: r.status, text: r.text, parsed, items });

      if (verdict.kind === 'source-failed') {
        // 한도 초과·키 문제는 계정 단위다. 남은 종목을 두드려도 같은 답이 온다.
        sourceFailure = verdict.reason;
        console.log(`  !! ${exam.slug} (${exam.jmCd}) ${verdict.reason}`);
        console.log(`\n⛔ 계정 단위 거절이다. 남은 ${exams.length - exams.indexOf(exam) - 1}종목을 호출하지 않는다.`);
        break;
      }
      if (verdict.kind === 'exam-failed') {
        failed.push({ slug: exam.slug, jmCd: exam.jmCd, reason: verdict.reason });
        console.log(`  ${verdict.reason === '레코드 없음' ? '- ' : '!!'} ${exam.slug} (${exam.jmCd}) ${verdict.reason}`);
        continue;
      }
      // 과거 연도 조회가 불가하므로 원본을 남긴다. 지금 받은 것을 잃으면 복구할 수 없다.
      raw[exam.jmCd] = items;

      const normalized = groupRows(items).map(g => normalizeGroup(g));
      perExam.push({ exam, sessions: normalized });
      const n = normalized.reduce((s, x) => s + x.events.length, 0);
      const warn = normalized.some(s => s.contradictions) ? ' ⚠모순' : '';
      console.log(`  ok ${exam.slug} (${exam.jmCd}) 레코드 ${items.length} → ${normalized.length}회차 · 이벤트 ${n}개${warn}`);
    } catch (err) {
      const reason = String(err.message ?? err);
      failed.push({ slug: exam.slug, jmCd: exam.jmCd, reason });
      console.log(`  !! ${exam.slug} (${exam.jmCd}) ${reason}`);

      // 네트워크가 통째로 죽었으면 나머지를 두드리지 않는다
      if (++consecutiveNetworkErrors >= NETWORK_GIVE_UP) {
        sourceFailure = `연속 ${consecutiveNetworkErrors}종목 네트워크 실패 — ${reason}`;
        const left = exams.length - exams.indexOf(exam) - 1;
        console.log(`\n⛔ 엔드포인트가 응답하지 않는다. 남은 ${left}종목을 호출하지 않는다.`);
        break;
      }
    }
    await new Promise(r => setTimeout(r, 120)); // 호출 간 간격
  }

  // ---- 그룹 접기 ----
  const beforeFold = perExam.reduce((s, m) => s + m.sessions.length, 0);
  const { sessions: folded, splits } = foldGroups(perExam);

  console.log(`\n그룹 접기: ${perExam.length}종목 · ${beforeFold}회차 → ${new Set(folded.map(s => s.groupId)).size}그룹 · ${folded.length}회차`);
  if (splits.length) {
    console.log(`⚠ 선언된 그룹인데 일정이 갈린 곳 ${splits.length}건 — 시드의 groupId 를 고쳐야 한다:`);
    for (const sp of splits) {
      console.log(`  ${sp.groupId} → 변종 ${sp.variantCount}개`);
      for (const v of sp.variants) console.log(`    ${v.sessionCount}회차 · ${v.examSlugs.join(', ')}`);
    }
  }

  // ---- 소스 단위 병합 ----
  const now = new Date().toISOString();
  const stamp = now.slice(0, 10);

  // 종목 실패를 소스 건강도에 반영한다.
  //
  // 전에는 `perExam.length > 0` 이면 ok 였다. 그래서 29/47 이 실패한 실행이 health:'ok'
  // 로 남고, stale 폴백이 작동하지 않아 그룹 3개와 회차 49건이 조용히 사라졌다 (#18).
  // 일부 실패는 여전히 통과시킨다 (FR-DAT-06) — 허용치는 qnet.mjs 가 정한다.
  const health = sourceHealth({ total: exams.length, failed: failed.length, sourceFailure });
  const qnetOk = health.ok;
  const harvests = [{
    id: 'qnet',
    method: 'api',
    ok: qnetOk,
    sessions: folded,
    error: health.error,
  }];
  if (!qnetOk) console.log(`\n⚠ qnet 소스 실패 — ${health.error}`);

  // ---- 크롤 소스 ----
  // robots 를 먼저 확인하고 금지면 요청하지 않는다. 어댑터가 늘어도 이 게이트를
  // 반드시 통과해야 하므로, 금지 사이트를 실수로 추가하는 것이 구조적으로 어려워진다.
  for (const src of CRAWL_SOURCES) {
    const group = groupSeed.groups.find(g => g.id === src.groupId);
    const url = group?.sourceUrl;
    if (!url) {
      console.log(`  -  ${src.id} groups.seed.json 에 sourceUrl 이 없어 건너뜀`);
      continue;
    }
    const h = await harvestCrawl(src, url, YEAR);
    harvests.push(h);
    console.log(
      h.ok
        ? `  ok ${src.id} ${h.sessions.length}회차 · 이벤트 ${h.sessions.reduce((s, x) => s + x.events.length, 0)}개`
        : `  !! ${src.id} ${h.error}`,
    );
    if (h.rawHtml) crawlRaw[src.id] = h.rawHtml;
  }

  // ---- 파일 소스 ----
  // 원본은 이미 저장소에 커밋돼 있으므로 아카이브하지 않는다.
  for (const { src, path, observedAt, staleAfterDays } of FILE_SOURCES) {
    const h = await src.collectFile({ path, year: YEAR, observedAt });
    harvests.push({ ...h, staleAfterDays });
    const d = h.diagnostics ?? {};
    console.log(
      h.ok
        ? `  ok ${src.id} ${h.sessions.length}회차 · 이벤트 ${h.sessions.reduce((s, x) => s + x.events.length, 0)}개`
          + `${d.ignored ? ` · 대상 외 ${d.ignored}행 무시` : ''}`
        : `  !! ${src.id} ${h.error}`,
    );
    // 매핑에 없는 시험명은 표기가 바뀐 것이다. 조용히 넘기지 않고 눈에 보이게 찍는다.
    for (const f of (d.failures ?? []).slice(0, 5)) {
      console.log(`     · ${f.reason}: ${f.name ?? ''} ${f.label ?? ''} ${f.raw ?? ''}`.trimEnd());
    }
    if ((d.failures ?? []).length > 5) console.log(`     · … 외 ${d.failures.length - 5}건`);
  }

  const prev = await readPrevious();
  if (!prev) {
    console.log(`\n※ ${PUBLISHED}/ 에 이전 결과가 없다. 첫 실행이므로 폴백 대상이 없다.`);
  }
  const merged = mergeStale(harvests, prev, { now });
  for (const n of merged.notes) console.log(`  · ${n}`);

  const groups = buildGroups(groupSeed, merged.sessions, splits);

  // 원본 아카이브. implYy=2024 가 빈 응답이므로 과거 데이터는 재수집이 불가능하다.
  //
  // 성공했을 때만 남긴다. 실패한 실행의 빈 응답을 저장하면 아카이브가 오염되고,
  // 다음 성공 실행이 그 빈 스냅샷과 비교해 '내용이 바뀌었다' 로 오판해 매번 재저장한다.
  let arch = { written: false, path: null, reason: '수집 실패로 저장하지 않음' };
  if (qnetOk) {
    arch = await archive({ year: YEAR, sourceId: 'qnet', body: raw, stamp });
  }
  console.log(`\n아카이브: ${arch.written ? '저장' : '생략'} — ${arch.reason}`);
  if (arch.written) console.log(`  ${arch.path}`);

  // 크롤 원본도 남긴다. 사이트가 개편되면 그날 바이트가 유일한 단서다.
  //
  // 어댑터가 선언한 volatile 패턴은 **해시에만** 적용된다. 이게 없으면 KBS 처럼
  // 페이지에 서버 시각이 박힌 사이트가 실행마다 122KB 를 쌓는다.
  const crawlArchives = [];
  for (const [srcId, html] of Object.entries(crawlRaw)) {
    const src = CRAWL_SOURCES.find(s => s.id === srcId);
    const a = await archive({
      year: YEAR,
      sourceId: srcId,
      body: html,
      volatile: src?.volatile ?? [],
      ext: 'html',
      stamp,
    });
    if (a.written) crawlArchives.push(a.path);
  }
  if (crawlArchives.length) console.log(`  크롤 원본 ${crawlArchives.length}건 저장`);

  // 화면에 노출할 종목: **일정이 실제로 들어온 그룹의 종목**만.
  // API 종목만 내보내면 한능검·토익처럼 크롤로 들어온 종목을 고를 수 없다.
  // 반대로 시드 전체를 내보내면 일정 없는 종목이 빈 카드로 뜬다.
  const withSessions = new Set(merged.sessions.map(s => s.groupId));
  const publishedExams = seed.exams.filter(e => withSessions.has(e.groupId));
  console.log(`\n화면 노출 종목 ${publishedExams.length}개 (일정이 있는 그룹 ${withSessions.size}개)`);

  const meta = {
    fetchedAt: now,
    year: YEAR,
    examCount: publishedExams.length,
    /** Q-Net API 로 받은 종목 수. examCount 와 다르면 크롤·CSV 가 붙은 것이다 */
    qnetExamCount: exams.length,
    groupCount: new Set(merged.sessions.map(s => s.groupId)).size,
    sessionCount: merged.sessions.length,
    eventCount: merged.sessions.reduce((s, x) => s + x.events.length, 0),
    tbdCount: merged.sessions.filter(s => s.status === 'tbd').length,
    staleCount: merged.sessions.filter(s => s.stale).length,
    contradictionCount: merged.sessions.filter(s => s.contradictions).length,
    groupSplitCount: splits.length,
    groupSplits: splits,
    sessionsBeforeFold: beforeFold,
    sources: merged.sources,
    archive: arch.written ? arch.path : null,
    notes: merged.notes,
    failed,
  };

  await writeAll({
    year: YEAR,
    sessions: merged.sessions,
    groups,
    exams: publishedExams,
    categories: seed.categories,
    links: seed.links,
    meta,
    provenance: merged.provenance,
  });

  console.log(`\n그룹 ${meta.groupCount}개 · 회차 ${meta.sessionCount}건 · 이벤트 ${meta.eventCount}개${meta.staleCount ? ` · stale ${meta.staleCount}건` : ''}`);
  if (failed.length) console.log(`종목 실패 ${failed.length}건 — ${PUBLISHED}/meta.json 참고`);
  console.log(`${PUBLISHED}/ sessions·groups·exams·meta·provenance 생성 완료`);

  // 산출물을 먼저 쓴 다음에 빨간불을 켠다. 파서 하나가 틀린 것으로 사이트를 얼리지 않는다.
  if (splits.length || merged.failedSources.length) process.exitCode = 1;
}

// ---- 실행 -------------------------------------------------------------

const seed = JSON.parse(await readFile('data/exams.seed.json', 'utf8'));
if (DUMP) await dump(DUMP);
else if (PROBE) await probe(seed);
else await collect(seed, JSON.parse(await readFile('data/groups.seed.json', 'utf8')));
