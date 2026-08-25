#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname } from 'node:path';
import { archive } from './lib/store.mjs';
import { DETAIL_ADAPTERS } from './lib/detail-adapters.mjs';
import { fetchDetailRaw, fetchDetailUrl, prepareDetailProposal, sourceUrlOf } from './lib/detail-collector.mjs';
import { checkDetailSources } from './lib/detail-source-check.mjs';

const valueOf = name => (process.argv.find(arg => arg.startsWith(`--${name}=`)) ?? '').slice(name.length + 3) || null;
const stampOf = instant => instant.replaceAll('-', '').replaceAll(':', '').replace('.000', '');

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function readJsonOrNull(path) {
  try {
    return await readJson(path);
  } catch {
    return null;
  }
}

async function collectOne({ source, inputPath, evidencePath, exams, currentDetails, knownExamSlugs, sourceIds, now = new Date() }) {
  if (source.collectionStatus !== 'active') throw new Error(`${source.id}: ${source.collectionStatus} 출처는 수집할 수 없다.`);
  if (source.method === 'manual-upload' && (!inputPath || !evidencePath)) {
    throw new Error(`${source.id}: --input=<정규화 JSON>과 --evidence=<공식 원문>이 모두 필요하다.`);
  }
  if (source.method !== 'manual-upload' && inputPath) throw new Error(`${source.id}: 자동 출처에는 --input을 쓸 수 없다.`);
  if (source.method !== 'manual-upload' && evidencePath) throw new Error(`${source.id}: 자동 출처에는 --evidence를 쓸 수 없다.`);

  const adapter = DETAIL_ADAPTERS.get(source.adapter);
  if (!adapter) throw new Error(`${source.id}: adapter ${source.adapter}가 구현되지 않았다.`);
  let parseInput = inputPath ? await readFile(inputPath, 'utf8') : null;
  let raw;
  if (evidencePath) {
    raw = await readFile(evidencePath);
  } else if (adapter.collect) {
    const robotsCache = new Map();
    const collected = await adapter.collect({ source, exams, fetchDetailRaw, fetchDetailUrl, robotsCache, sourceUrlOf });
    raw = collected.raw;
    parseInput = collected.parseInput ?? raw;
  } else {
    raw = await fetchDetailRaw(source);
  }
  const observedAt = now.toISOString();
  const uploadedExt = evidencePath ? extname(evidencePath).slice(1).toLowerCase() : null;
  const ext = uploadedExt && ['html', 'json', 'pdf', 'txt'].includes(uploadedExt)
    ? uploadedExt
    : adapter.extension ?? (source.method === 'pdf' ? 'pdf' : source.method === 'json' ? 'json' : 'html');
  const archived = await archive({
    year: now.getUTCFullYear(), sourceId: source.id, body: raw, ext,
    dir: 'data/archive/details', stamp: stampOf(observedAt),
  });
  const prepared = prepareDetailProposal({
    source, raw, parseInput: parseInput ?? raw, archivePath: archived.path, observedAt,
    currentDetails, knownExamSlugs, sourceIds,
  });
  if (!prepared.changes.length) {
    console.log(`  - ${source.id}: 의미 변경 없음 (${archived.reason})`);
    return { sourceId: source.id, changed: false, proposal: prepared.proposal };
  }
  await mkdir('data/proposals/details', { recursive: true });
  const proposalPath = `data/proposals/details/${source.id}.json`;
  const existing = await readJsonOrNull(proposalPath);
  if (existing?.status === 'review-required' && existing.contentHash === prepared.proposal.contentHash) {
    console.log(`  - ${source.id}: 같은 원문의 후보가 이미 리뷰 대기 중`);
    return { sourceId: source.id, changed: false, proposal: existing };
  }
  await writeFile(proposalPath, `${JSON.stringify(prepared.proposal, null, 2)}\n`, 'utf8');
  console.log(`  ok ${source.id}: ${prepared.changes.length}개 시험 변경 후보 → ${proposalPath}`);
  return { sourceId: source.id, changed: true, proposal: prepared.proposal };
}

async function run() {
  const [examSeed, detailSeed, sourceSeed] = await Promise.all([
    readJson('data/exams.seed.json'), readJson('data/exam-details.seed.json'), readJson('data/detail-sources.seed.json'),
  ]);
  const visible = examSeed.exams.filter(exam => exam.tier !== 'X').map(exam => exam.slug);
  const registry = checkDetailSources(sourceSeed, visible, { knownAdapters: [...DETAIL_ADAPTERS.keys()] });
  if (!registry.ok) throw new Error(registry.problems.join('\n'));

  const sourceId = valueOf('source');
  const inputPath = valueOf('input');
  const evidencePath = valueOf('evidence');
  const targets = sourceId
    ? sourceSeed.sources.filter(source => source.id === sourceId)
    : sourceSeed.sources.filter(source => source.collectionStatus === 'active' && source.method !== 'manual-upload');
  if (sourceId && !targets.length) throw new Error(`상세 출처 ${sourceId}를 찾지 못했다.`);
  if (!sourceId && inputPath) throw new Error('--input을 쓸 때는 --source도 지정해야 한다.');
  if (!sourceId && evidencePath) throw new Error('--evidence를 쓸 때는 --source도 지정해야 한다.');
  if (!targets.length) {
    console.log('활성 자동 상세정보 출처 없음 — 승인형 업로드는 --source와 --input을 지정한다.');
    return;
  }

  const failures = [];
  for (const source of targets) {
    try {
      await collectOne({
        source, inputPath, evidencePath, exams: examSeed.exams, currentDetails: detailSeed.details, knownExamSlugs: visible,
        sourceIds: new Set(sourceSeed.sources.map(candidate => candidate.id)),
      });
    } catch (error) {
      failures.push({ sourceId: source.id, reason: error?.message ?? String(error) });
      console.error(`  fail ${source.id}: ${error?.message ?? error}`);
    }
  }
  if (failures.length) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await run();
