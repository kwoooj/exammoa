/**
 * 사전 렌더. `vite build` 와 `vite build --ssr` 이 끝난 뒤에 돈다.
 *
 * 왜 하는가: 화면정의 §1.2 가 "검색엔진 → 시험 상세" 를 첫 번째 유입 경로로 못
 * 박았는데, 순수 CSR 이면 크롤러가 받아 가는 HTML 이 빈 `<div id="root">` 하나다.
 * 여기서 종목마다 내용이 채워진 파일을 만들어 둔다.
 *
 * 순수한 계산은 `lib/prerender-html.mjs` 에 있고 테스트가 붙어 있다. 이 파일은
 * 파일을 읽고 쓰는 일만 한다 — `dist/` 는 gitignore 대상이라 CI 에 없고, 거기를
 * 읽는 테스트는 조용히 통과하기 때문이다 (규칙 9).
 *
 * **끝내기 전에 스스로 검사한다.** 규칙 10 이 말한 실패 형태가 그대로 적용된다:
 * 위험한 결과는 크래시가 아니라 68개 파일이 성공적으로 비어 있는 것이다. CI 가
 * 이미 `npm run build` 를 돌리므로 이 게이트는 PR 마다 공짜로 걸린다.
 */

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  checkPage,
  injectApp,
  injectHead,
  outPathFor,
  sitemapXml,
} from './lib/prerender-html.mjs';

const DIST = 'dist';
const SERVER_DIR = join(DIST, 'server');
const DATA_DIR = join(DIST, 'data');
const ORIGIN = (process.env.SITE_ORIGIN ?? 'https://exammoa.example').replace(/\/+$/, '');

/** 종목 페이지가 이보다 작으면 내용이 안 들어간 것이다 */
const MIN_BYTES = 2000;

async function loadEntry() {
  const url = pathToFileURL(join(process.cwd(), SERVER_DIR, 'entry-server.js')).href;
  try {
    return await import(url);
  } catch (cause) {
    throw new Error(`SSR 번들을 찾지 못했습니다. 'vite build --ssr' 이 먼저 돌아야 합니다 (${SERVER_DIR})`, { cause });
  }
}

/**
 * 클라이언트가 `fetch` 할 바로 그 파일에서 읽는다.
 *
 * `data/published/` 가 아니라 `dist/data/` 다. 사전 렌더와 런타임이 다른 바이트를
 * 보면 하이드레이션이 어긋나는데, 그 어긋남은 브라우저 콘솔에만 나타나서 배포 뒤에야
 * 드러난다.
 */
const diskReader = async file => JSON.parse(await readFile(join(DATA_DIR, `${file}.json`), 'utf8'));

/** 쓴 이름이 읽을 때 그대로 돌아오는지 본다 — macOS 조합형 함정 방어 */
async function verifyName(outPath) {
  const dir = dirname(join(DIST, outPath));
  const want = dir.split(/[\\/]/).pop();
  if (!want) return;
  const entries = await readdir(dirname(dir));
  if (!entries.includes(want)) {
    throw new Error(
      `디렉터리 이름이 왕복하지 않습니다: ${want}\n` +
      `파일시스템이 조합형으로 저장한 것 같습니다. 이대로 배포하면 완성형 주소가 404 가 됩니다.`,
    );
  }
}

async function main() {
  const entry = await loadEntry();

  const template = await readFile(join(DIST, 'index.html'), 'utf8');
  const raw = await entry.loadRaw(diskReader);
  const data = entry.buildAppData(raw);

  const paths = entry.collectRoutes(data);
  const problems = [];
  let written = 0;
  let biggest = 0;

  for (const path of paths) {
    const page = entry.renderPage(path, data, ORIGIN);
    const html = injectApp(injectHead(template, page.head), page.html, page.payload);

    // 종목 페이지에는 그 종목의 이름이 글자로 들어 있어야 한다. 이 한 줄이
    // "성공적으로 렌더된 빈 페이지" 를 잡는다.
    const slug = path.startsWith('/exam/') ? decodeURIComponent(path.slice('/exam/'.length)) : null;
    const mustContain = slug ? [data.examBySlug.get(slug)?.name ?? slug] : [];

    problems.push(...checkPage({ path, html, mustContain, minBytes: MIN_BYTES }));

    const outPath = outPathFor(path);
    const full = join(DIST, outPath);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, html, 'utf8');
    if (slug) await verifyName(outPath);

    written++;
    biggest = Math.max(biggest, Buffer.byteLength(html, 'utf8'));
  }

  // 호스트 관례. 404/index.html 과 별개로 루트에도 둔다.
  await writeFile(join(DIST, '404.html'), await readFile(join(DIST, '404', 'index.html'), 'utf8'), 'utf8');

  await writeFile(
    join(DIST, 'sitemap.xml'),
    sitemapXml(ORIGIN, paths.filter(p => p !== '/404'), data.buildDate),
    'utf8',
  );

  // ---- 자기 검사 -------------------------------------------------------

  if (written !== paths.length) {
    problems.push(`쓴 파일 ${written}개가 라우트 ${paths.length}개와 다릅니다`);
  }
  const examPages = paths.filter(p => p.startsWith('/exam/')).length;
  if (examPages !== data.exams.length) {
    problems.push(`종목 페이지 ${examPages}개가 종목 ${data.exams.length}개와 다릅니다`);
  }

  if (problems.length) {
    console.error('사전 렌더 실패:');
    for (const p of problems.slice(0, 20)) console.error(`  - ${p}`);
    if (problems.length > 20) console.error(`  … 외 ${problems.length - 20}건`);
    process.exit(1);
  }

  // SSR 번들은 배포하지 않는다
  await rm(SERVER_DIR, { recursive: true, force: true });

  console.log(
    `사전 렌더 ${written}개 페이지 · 종목 ${examPages}개 · 최대 ${Math.round(biggest / 1024)}KB · origin ${ORIGIN}`,
  );
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  if (err instanceof Error && err.cause) console.error(err.cause);
  process.exit(1);
});
