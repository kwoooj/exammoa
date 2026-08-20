#!/usr/bin/env node
// 시드 무결성 검사 CLI. 네트워크를 타지 않는다.
//
//   npm run check:seed
//   node scripts/check-seed.mjs data/exams.seed.json data/groups.seed.json
//
// `npm run check` 와 `npm run collect` 가 이걸 먼저 돌린다. 시드가 깨진 채로
// 47번 API 를 호출할 이유가 없다.

import { readFile } from 'node:fs/promises';
import { checkSeeds, formatProblems } from './lib/seed-check.mjs';
import { checkFeeSeed } from './lib/fees.mjs';

const [examPath = 'data/exams.seed.json', groupPath = 'data/groups.seed.json', feePath = 'data/fees.seed.json'] = process.argv.slice(2);

const read = async (path) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    console.error(`${path} 를 읽지 못했다 — ${err.message ?? err}`);
    process.exit(1);
  }
};

const exams = await read(examPath);
const schedules = checkSeeds(exams, await read(groupPath));
const fees = checkFeeSeed(await read(feePath), exams.exams ?? []);
const problems = [...schedules.problems, ...fees.problems.map(problem => `응시료: ${problem}`)];
console.log(formatProblems(problems));
if (!schedules.ok || !fees.ok) process.exitCode = 1;
