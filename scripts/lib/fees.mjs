import { readTables } from './html.mjs';
import { decodeResponse } from './csv.mjs';
import { parseRobots, verdictRobots } from '../probe-crawl.mjs';

// HTTP 헤더 값은 ByteString 이어야 한다. 한글 서비스명을 넣으면 Node fetch가 요청 전에 던진다.
const UA = 'Mozilla/5.0 (compatible; ExamMoa-FeeCheck/1.0; +https://github.com/)';
const QNET_DETAIL = 'https://www.q-net.or.kr/crf005.do?gId=&gSite=Q&id=crf00503s02&jmInfoDivCcd=B0&jmCd=';

const dayOf = now => new Date(now).toISOString().slice(0, 10);
const money = text => {
  const n = Number(String(text ?? '').replace(/[^0-9]/g, ''));
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

/** Q-Net 종목 상세의 수수료 표를 필기·실기 금액으로 변환한다. */
export function parseQnetFee(html) {
  // 일정표에도 '필기시험'·'실기시험'이 있어 부분 문자열 기반 tableByHeader는 그 표를
  // 먼저 고른다. Q-Net이 제공하는 접근성 caption으로 수수료 표를 명시적으로 고른다.
  const table = readTables(html).find(candidate => candidate.caption?.includes('수수료'));
  if (!table) return null;
  const headerRow = table.grid.findIndex(row => {
    const cells = row.map(cell => cell.text.replace(/\s/g, ''));
    return cells.includes('필기') && cells.includes('실기');
  });
  if (headerRow < 0) return null;
  const writtenCol = table.grid[headerRow].findIndex(cell => cell.text.replace(/\s/g, '') === '필기');
  const practicalCol = table.grid[headerRow].findIndex(cell => cell.text.replace(/\s/g, '') === '실기');
  const row = table.grid[headerRow + 1];
  if (!row) return null;
  const written = money(row[writtenCol]?.text);
  const practical = money(row[practicalCol]?.text);
  if (!written || !practical) return null;
  return [
    { label: '필기', amount: written },
    { label: '실기', amount: practical },
  ];
}

const compact = value => String(value ?? '').replace(/[\s,]/g, '');
const regexEscape = value => String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function labeledPageFees(html, label) {
  const text = String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ');
  return [...new Set([...text.matchAll(new RegExp(`${regexEscape(label)}\\s*([0-9][0-9,]*)\\s*원`, 'g'))]
    .map(match => money(match[1]))
    .filter(Boolean))];
}

/** 공식 HTML에 현재 기준 금액이 모두 남아 있는지 확인한다. */
export function pageContainsFee(html, record) {
  if (record.source.feeLabel) {
    const observed = labeledPageFees(html, record.source.feeLabel);
    const expected = [...new Set(record.items.map(item => item.amount).filter(Number.isSafeInteger))];
    return observed.length === expected.length && observed.every(amount => expected.includes(amount));
  }
  const body = compact(html);
  const fingerprints = record.source.fingerprints
    ?? record.items.filter(item => item.amount !== undefined).map(item => `${item.amount}원`);
  return fingerprints.every(value => body.includes(compact(value)));
}

export function checkFeeSeed(seed, exams) {
  const problems = [];
  if (!Array.isArray(seed?.fees)) return { ok: false, problems: ['fees 배열이 없다.'] };
  const known = new Set(exams.map(exam => exam.slug));
  const visible = exams.filter(exam => exam.tier !== 'X');
  const seen = new Set();
  for (const record of seed.fees) {
    if (!record?.slug || seen.has(record.slug)) problems.push(`중복되거나 빈 slug: ${record?.slug ?? '(없음)'}`);
    seen.add(record?.slug);
    if (!known.has(record.slug)) problems.push(`시험 시드에 없는 응시료: ${record.slug}`);
    if (!Array.isArray(record.items) || !record.items.length) problems.push(`${record.slug}: items가 비었다.`);
    for (const item of record.items ?? []) {
      const hasAmount = Number.isSafeInteger(item.amount) && item.amount >= 0;
      const hasLabel = typeof item.amountLabel === 'string' && item.amountLabel.trim().length > 0;
      if (!item.label || hasAmount === hasLabel) {
        problems.push(`${record.slug}: 잘못된 금액 항목 ${JSON.stringify(item)}`);
      }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.checkedAt ?? '')) problems.push(`${record.slug}: checkedAt 형식 오류`);
    if (!['qnet', 'page', 'manual'].includes(record.source?.kind)) problems.push(`${record.slug}: source.kind 오류`);
    if (record.source?.kind === 'page' && !record.source.url) problems.push(`${record.slug}: page URL이 없다.`);
  }
  for (const exam of visible) if (!seen.has(exam.slug)) problems.push(`${exam.slug}: 응시료가 없다.`);
  return { ok: problems.length === 0, problems };
}

function sameItems(a, b) {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}

function feeOf(record, items = record.items, checkedAt = record.checkedAt) {
  return { items, checkedAt, ...(record.note ? { note: record.note } : {}) };
}

async function assertRobotsAllowed(url, fetchImpl, cache) {
  const origin = new URL(url).origin;
  if (!cache.has(origin)) {
    for (let attempt = 1; attempt <= 2 && !cache.has(origin); attempt++) {
      try {
        const response = await fetchImpl(`${origin}/robots.txt`, {
          headers: { 'User-Agent': UA },
          signal: AbortSignal.timeout(10000),
        });
        if (response.status === 429 || response.status >= 500) {
          cache.set(origin, { state: 'hold', rules: [], note: `robots.txt HTTP ${response.status}` });
        } else if (response.status >= 400) {
          cache.set(origin, { state: 'allow-all', rules: [], note: `robots.txt HTTP ${response.status}` });
        } else {
          const text = await response.text();
          cache.set(origin, !text.trim() || text.trimStart().startsWith('<')
            ? { state: 'allow-all', rules: [], note: 'robots.txt 규칙 없음' }
            : { state: 'parsed', rules: parseRobots(text), note: null });
        }
      } catch (error) {
        if (attempt === 2) {
          cache.set(origin, { state: 'hold', rules: [], note: `robots.txt 요청 실패(2회): ${error?.message ?? error}` });
        } else {
          await new Promise(resolve => setTimeout(resolve, 250));
        }
      }
    }
  }
  const verdict = verdictRobots(cache.get(origin), url);
  if (!verdict.ok) throw new Error(`robots ${verdict.label}: ${verdict.detail}`);
}

async function fetchHtml(url, fetchImpl, robotsCache) {
  await assertRobotsAllowed(url, fetchImpl, robotsCache);
  const response = await fetchImpl(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,*/*', 'Accept-Language': 'ko-KR,ko;q=0.9' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await decodeResponse(response)).text;
}

/**
 * 모든 노출 시험의 응시료를 확인한다.
 *
 * Q-Net은 금액을 직접 파싱해 인상분을 자동 반영한다. 다른 공식 페이지는 기준 금액의
 * fingerprint가 사라지면 실패로 보고 직전 게시 금액을 유지한다. 수기 소스는 확인
 * 기한이 지나면 배치를 실패시켜 사람이 다시 공식 문서를 확인하도록 한다.
 */
export async function collectFees(exams, feeSeed, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const today = dayOf(options.now ?? new Date());
  const previous = new Map((options.previousExams ?? []).map(exam => [exam.slug, exam.fee]));
  const records = new Map(feeSeed.fees.map(record => [record.slug, record]));
  const robotsCache = new Map();
  const pageCache = new Map();
  const fees = new Map();
  const failures = [];
  const changes = [];
  let verified = 0;
  let manual = 0;

  for (const exam of exams) {
    const record = records.get(exam.slug);
    if (!record) continue;
    const fallback = previous.get(exam.slug) ?? feeOf(record);
    try {
      if (record.source.kind === 'qnet') {
        if (!exam.jmCd) throw new Error('Q-Net 종목코드가 없다');
        const items = parseQnetFee(await fetchHtml(`${QNET_DETAIL}${exam.jmCd}`, fetchImpl, robotsCache));
        if (!items) throw new Error('수수료 표를 찾지 못했다 (사이트 개편 가능)');
        fees.set(exam.slug, feeOf(record, items, today));
        if (!sameItems(items, fallback.items)) changes.push({ slug: exam.slug, before: fallback.items, after: items });
        verified++;
      } else if (record.source.kind === 'page') {
        if (!pageCache.has(record.source.url)) {
          pageCache.set(record.source.url, fetchHtml(record.source.url, fetchImpl, robotsCache));
        }
        const html = await pageCache.get(record.source.url);
        if (!pageContainsFee(html, record)) throw new Error('기준 금액을 공식 페이지에서 찾지 못했다 (인상 또는 개편 가능)');
        fees.set(exam.slug, feeOf(record, record.items, today));
        verified++;
      } else {
        const maxDays = record.source.recheckAfterDays ?? 90;
        const age = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${record.checkedAt}T00:00:00Z`)) / 86400000);
        if (!Number.isFinite(age) || age > maxDays) throw new Error(`수기 확인 ${age}일 경과 (기한 ${maxDays}일)`);
        fees.set(exam.slug, feeOf(record));
        manual++;
      }
    } catch (error) {
      fees.set(exam.slug, fallback);
      failures.push({ slug: exam.slug, reason: String(error?.message ?? error).slice(0, 160) });
    }
    if (options.delayMs) await new Promise(resolve => setTimeout(resolve, options.delayMs));
  }

  return {
    exams: exams.map(exam => fees.has(exam.slug) ? { ...exam, fee: fees.get(exam.slug) } : exam),
    failures,
    changes,
    stats: {
      total: exams.length,
      covered: fees.size,
      verified,
      manual,
      fallback: failures.length,
    },
  };
}
