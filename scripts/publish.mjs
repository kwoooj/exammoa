#!/usr/bin/env node
// build/*.json → public/data/ 로 복사한다. 의존성 없음.
//
// App.tsx 가 /data/*.json 을 fetch 하므로 vite 가 public/ 을 정적 서빙하는 경로에
// 산출물이 있어야 한다. cp -r 은 Windows 에서 동작이 갈리므로 node 로 쓴다.
//
//   node scripts/publish.mjs        build → public/data
//   npm run dev                     이 스크립트를 먼저 돌린다 (predev)

import { readdir, mkdir, copyFile, stat } from 'node:fs/promises';

const FROM = 'build';
const TO = 'public/data';

// 클라이언트가 받을 파일만 복사한다. api-coverage/crawl-report 는 진단용이라 제외한다.
const WANTED = ['exams.json', 'groups.json', 'sessions.json', 'meta.json'];

try {
  await stat(FROM);
} catch {
  console.error(`${FROM}/ 이 없습니다. 먼저 수집을 실행하세요:\n  QNET_KEY=... node scripts/collect.mjs`);
  process.exit(1);
}

await mkdir(TO, { recursive: true });

const present = new Set(await readdir(FROM));
const missing = WANTED.filter(f => !present.has(f));
const copied = [];

for (const f of WANTED) {
  if (!present.has(f)) continue;
  await copyFile(`${FROM}/${f}`, `${TO}/${f}`);
  copied.push(f);
}

console.log(`${TO} ← ${copied.join(', ')}`);
if (missing.length) {
  // 화면이 조용히 빈 채로 뜨는 것보다 여기서 알리는 편이 낫다.
  console.error(`\n누락 ${missing.length}건: ${missing.join(', ')}`);
  console.error('수집이 끝까지 돌지 않았습니다. npm run collect 를 다시 실행하세요.');
  process.exit(1);
}
