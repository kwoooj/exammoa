import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist' },
  // 포트를 고정하지 않는다. 다른 프로젝트의 dev 서버와 충돌하면 도구가 포트를 넘겨준다.
  server: { port: process.env.PORT ? Number(process.env.PORT) : undefined },
});
