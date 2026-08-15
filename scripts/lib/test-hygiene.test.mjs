// node --test scripts/lib/test-hygiene.test.mjs
//
// 테스트에 대한 테스트.
//
// 크롤 어댑터 테스트 16건이 `build/crawl/*.html` 을 읽고 없으면 `return` 했다. 그
// 경로가 `.gitignore` 대상이라 **CI 에서는 파일이 없어 전부 조용히 통과했다.**
// 로컬에서는 파일이 있어서 돌았으므로 아무도 눈치채지 못했다. 초록불이 아무것도
// 확인하지 않는 상태가 몇 주 갔다.
//
// 같은 일이 다시 일어나지 않게 여기서 막는다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * gitignore 대상이라 CI 에 존재하지 않는 경로들.
 *
 * `dist/` 는 사전 렌더 산출물이 생기면서 추가됐다. 거기를 읽는 테스트는 로컬에서
 * `npm run build` 를 돌린 뒤에만 통과하고 CI 에서는 조용히 넘어간다 — 이 파일이
 * 존재하는 바로 그 실패 형태다. 사전 렌더의 검증은 두 갈래로 나눠 뒀다:
 * 순수 계산은 `prerender-html.test.mjs` 가 인라인 픽스처로, 산출물 자체는
 * `scripts/prerender.mjs` 가 빌드 안에서 검사하고 종료코드 1 을 낸다.
 */
const ABSENT_IN_CI = ['build/', 'public/data/', 'dist/', 'node_modules/.cache'];

async function testFiles(dir, ext) {
  const out = [];
  const walk = async (d) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.name.endsWith(ext)) out.push(p);
    }
  };
  await walk(dir);
  return out;
}

/** 검사기 자신은 뺀다 — 찾는 문자열을 스스로 담고 있다 */
const SELF = 'test-hygiene.test.mjs';

const allTests = async () => [
  ...await testFiles('scripts', '.test.mjs'),
  ...await testFiles('src', '.test.ts'),
].filter(p => !p.endsWith(SELF));

test('테스트가 CI 에 없는 경로를 읽지 않는다', async () => {
  const offenders = [];
  for (const path of await allTests()) {
    const src = await readFile(path, 'utf8');
    // 주석은 뺀다. 왜 이 규칙이 있는지 설명하려면 경로를 적어야 한다.
    const code = src.split('\n').filter(l => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*')).join('\n');
    for (const bad of ABSENT_IN_CI) {
      if (code.includes(`'${bad}`) || code.includes(`\`${bad}`) || code.includes(`"${bad}`)) {
        offenders.push(`${path} → ${bad}`);
      }
    }
  }
  assert.deepEqual(offenders, [],
    '고정 데이터를 테스트 파일 안에 두라. 이 경로는 CI 에 없어서 테스트가 조용히 통과한다');
});

test('테스트가 파일이 없다고 조용히 넘어가지 않는다', async () => {
  // `catch { return }` / `if (!x) return` 은 "픽스처가 없으면 검증하지 않는다" 는 뜻이다.
  const offenders = [];
  for (const path of await allTests()) {
    const src = await readFile(path, 'utf8');
    if (/catch\s*(\([^)]*\))?\s*\{\s*return\b/.test(src)) offenders.push(`${path} → catch { return }`);
  }
  assert.deepEqual(offenders, [], '픽스처가 없을 때 통과시키면 CI 에서 아무것도 검증하지 않는다');
});

test('테스트 파일이 실제로 있다 — 글롭이 조용히 0건을 잡을 수 있다', async () => {
  const files = await allTests();
  assert.ok(files.length >= 15, `테스트 파일이 ${files.length}개뿐이다`);
  // npm test 의 글롭 두 갈래가 각각 걸리는지
  assert.ok(files.some(f => f.endsWith('.test.mjs')));
  assert.ok(files.some(f => f.endsWith('.test.ts')));
});
