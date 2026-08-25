#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { checkDetailProposal, detailContentHash, promoteDetailProposal } from './lib/detail-proposal.mjs';
import { checkExamDetails } from './lib/detail-check.mjs';

const valueOf = name => (process.argv.find(arg => arg.startsWith(`--${name}=`)) ?? '').slice(name.length + 3) || null;
const readJson = path => readFile(path, 'utf8').then(JSON.parse);

const sourceId = valueOf('source');
const approvedHash = valueOf('approve');
if (!sourceId || !approvedHash) throw new Error('--source=<id>와 --approve=<contentHash>를 모두 지정해야 한다.');
if (!/^[a-z0-9][a-z0-9-]*$/.test(sourceId)) throw new Error('--source id 형식이 올바르지 않다.');

const [examSeed, detailSeed, sourceSeed, proposal] = await Promise.all([
  readJson('data/exams.seed.json'),
  readJson('data/exam-details.seed.json'),
  readJson('data/detail-sources.seed.json'),
  readJson(`data/proposals/details/${sourceId}.json`),
]);
const source = sourceSeed.sources.find(candidate => candidate.id === sourceId);
if (!source) throw new Error(`상세 출처 ${sourceId}를 찾지 못했다.`);
const visibleSlugs = examSeed.exams.filter(exam => exam.tier !== 'X').map(exam => exam.slug);
const sourceIds = new Set(sourceSeed.sources.map(candidate => candidate.id));
const proposalValidation = checkDetailProposal(proposal, source, visibleSlugs, { sourceIds });
if (!proposalValidation.ok) throw new Error(proposalValidation.problems.join('\n'));
const archivedRaw = await readFile(proposal.archivePath);
const promoted = promoteDetailProposal(detailSeed, proposal, source, {
  approvedHash,
  archiveHash: detailContentHash(archivedRaw),
  knownExamSlugs: visibleSlugs,
  sourceIds,
});
const validation = checkExamDetails(promoted, visibleSlugs, {
  sourceIds,
});
if (!validation.ok) throw new Error(validation.problems.join('\n'));
await writeFile('data/exam-details.seed.json', `${JSON.stringify(promoted, null, 2)}\n`, 'utf8');
await writeFile(`data/proposals/details/${sourceId}.json`, `${JSON.stringify({
  ...proposal,
  status: 'approved',
  approvedAt: new Date().toISOString(),
}, null, 2)}\n`, 'utf8');
console.log(`${sourceId} 후보 ${proposal.details.length}건을 승인 정본으로 승격했다.`);
