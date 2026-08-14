import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * `npm run preview` 를 배포 호스트처럼 굴린다.
 *
 * 사전 렌더를 붙이면서 이 사이트는 **여러 개의 진짜 HTML 파일**이 됐다. 그런데
 * `vite preview` 는 확장자 없는 경로(`/exams`)를 디렉터리 index 로 이어 주지 않아서
 * 404 가 난다. 실제 정적 호스트(Netlify·Cloudflare Pages·GitHub Pages)는 이어 준다.
 *
 * 그 차이를 그대로 두면 **로컬에서 확인할 수 없는 것을 배포에서 확인하게 된다.**
 * 여기서 호스트 동작을 흉내 내어, 배포 전에 68개 페이지를 눈으로 볼 수 있게 한다.
 *
 * 없는 경로는 루트가 아니라 404.html 로 보낸다 (HTTP 404 와 함께). 루트로 되돌리면
 * 없는 시험 주소가 홈 화면을 200 으로 돌려주고 검색엔진이 그것을 색인한다 (§11).
 */
function staticHostPreview(outDir: string): PluginOption {
  return {
    name: 'exammoa-static-host-preview',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = req.url ?? '/';
        const [pathname = '/', query] = raw.split('?');

        // 자산과 데이터는 그대로 둔다
        if (extname(pathname) || pathname.startsWith('/assets/') || pathname.startsWith('/data/')) {
          return next();
        }

        let decoded: string;
        try {
          decoded = decodeURIComponent(pathname);
        } catch {
          decoded = pathname;
        }
        const dir = decoded.replace(/\/+$/, '').normalize('NFC');
        const candidate = join(outDir, dir, 'index.html');

        if (dir === '' || existsSync(candidate)) {
          req.url = `${pathname.replace(/\/+$/, '')}/index.html${query ? `?${query}` : ''}`;
          return next();
        }

        const notFound = join(outDir, '404.html');
        if (existsSync(notFound)) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(readFileSync(notFound, 'utf8'));
          return;
        }
        return next();
      });
    },
  };
}

export default defineConfig(({ isPreview }) => ({
  plugins: [react(), staticHostPreview('dist')],
  build: { outDir: 'dist' },

  /**
   * 개발은 SPA, 미리보기는 MPA 다.
   *
   * `vite preview` 의 기본값(spa)은 모든 경로를 루트 `index.html` 로 되돌려서,
   * 정성껏 만든 `dist/exam/정보처리기사/index.html` 을 아무도 못 본다. 실제로
   * 그렇게 돌려 보고 나서야 알았다 — 68개 파일이 멀쩡히 있는데 서버가 안 준다.
   *
   * 개발 서버에는 사전 렌더가 없으므로 SPA 폴백이 맞다. 그게 없으면 `/exams` 를
   * 새로고침할 때 404 가 난다.
   */
  appType: isPreview ? 'mpa' : 'spa',

  // 포트를 고정하지 않는다. 다른 프로젝트의 dev 서버와 충돌하면 도구가 포트를 넘겨준다.
  server: { port: process.env.PORT ? Number(process.env.PORT) : undefined },
}));
