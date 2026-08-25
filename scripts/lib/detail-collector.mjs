import { DETAIL_ADAPTERS } from './detail-adapters.mjs';
import { checkDetailProposal, createDetailProposal, semanticDetailChanges } from './detail-proposal.mjs';
import { decodeResponse } from './csv.mjs';
import { parseRobots, verdictRobots } from '../probe-crawl.mjs';

const UA = 'Mozilla/5.0 (compatible; ExamMoa-DetailCollector/1.0; +https://github.com/kwoooj/exammoa)';

export function sourceUrlOf(source, exam = null) {
  if (source.sourceUrl) return source.sourceUrl;
  if (!source.urlTemplate || !exam) return null;
  return source.urlTemplate.replaceAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (_, key) => {
    const value = exam[key];
    if (value === undefined || value === null || value === '') throw new Error(`${exam.slug}: URL 치환값 ${key}가 없다.`);
    return encodeURIComponent(String(value));
  });
}

async function liveRobotsVerdict(source, url, fetchImpl, cache) {
  const robotsUrl = source.robots?.url ?? `${new URL(url).origin}/robots.txt`;
  if (!cache.has(robotsUrl)) {
    try {
      const response = await fetchImpl(robotsUrl, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(10000),
      });
      if (response.status === 429 || response.status >= 500) {
        cache.set(robotsUrl, { state: 'hold', rules: [], note: `robots.txt HTTP ${response.status}` });
      } else if (response.status >= 400) {
        cache.set(robotsUrl, { state: 'allow-all', rules: [], note: `robots.txt HTTP ${response.status}` });
      } else {
        const text = await response.text();
        cache.set(robotsUrl, !text.trim() || text.trimStart().startsWith('<')
          ? { state: 'allow-all', rules: [], note: 'robots.txt 규칙 없음' }
          : { state: 'parsed', rules: parseRobots(text), note: null });
      }
    } catch (error) {
      cache.set(robotsUrl, { state: 'hold', rules: [], note: `robots.txt 요청 실패: ${error?.message ?? error}` });
    }
  }
  return verdictRobots(cache.get(robotsUrl), url);
}

export async function fetchDetailUrl(source, url, fetchImpl = fetch, robotsCache = new Map()) {
  if (source.robots?.status !== 'allowed') throw new Error(`${source.id}: robots 허용 확인이 없는 자동 출처다.`);
  const live = await liveRobotsVerdict(source, url, fetchImpl, robotsCache);
  if (!live.ok) throw new Error(`${source.id}: robots ${live.label} — ${live.detail}`);
  const response = await fetchImpl(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/json,application/pdf,*/*', 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.7' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`${source.id}: HTTP ${response.status}`);
  return source.method === 'pdf'
    ? new Uint8Array(await response.arrayBuffer())
    : (await decodeResponse(response)).text;
}

export async function fetchDetailRaw(source, fetchImpl = fetch, robotsCache = new Map()) {
  if (!source.sourceUrl) throw new Error(`${source.id}: 공통 sourceUrl이 없다. urlTemplate 출처는 전용 adapter가 수집해야 한다.`);
  return fetchDetailUrl(source, source.sourceUrl, fetchImpl, robotsCache);
}

export function prepareDetailProposal({ source, raw, parseInput = raw, archivePath, observedAt, currentDetails, knownExamSlugs, sourceIds }) {
  const adapter = DETAIL_ADAPTERS.get(source.adapter);
  if (!adapter?.parse) throw new Error(`${source.id}: adapter ${source.adapter}가 구현되지 않았다.`);
  const parsed = adapter.parse(parseInput, { source });
  const proposal = createDetailProposal({
    source,
    raw,
    archivePath,
    observedAt,
    details: parsed.details,
    diagnostics: parsed.diagnostics,
  });
  const validation = checkDetailProposal(proposal, source, knownExamSlugs, { sourceIds });
  if (!validation.ok) throw new Error(validation.problems.join('\n'));
  const current = currentDetails.filter(detail => source.examSlugs.includes(detail.examSlug));
  return {
    proposal,
    changes: semanticDetailChanges(current, proposal.details),
  };
}
