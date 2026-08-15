/**
 * 브라우저 진입점.
 *
 * 사전 렌더된 HTML 이 있으면 **하이드레이션**, 개발 서버처럼 없으면 평범한 렌더다.
 * 갈림길을 심어 둔 `<script type="application/json">` 하나로 판단한다.
 */

import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import type { ReactNode } from 'react';
import App from './App.tsx';
import { DataProvider } from './data/DataContext.tsx';
import { TodayProvider } from './data/TodayContext.tsx';
import { buildAppData } from './data/index.ts';
import type { AppData } from './data/index.ts';
import type { Scope } from './data/slice.ts';
import type { RawData } from './data/source.ts';
import { RouterProvider } from './router/Router.tsx';
import { today } from './lib/dates.ts';
import './styles.css';

export const PAYLOAD_ID = '__exammoa';

interface Payload {
  buildDate: string;
  scope: Scope;
  data: RawData;
}

function readPayload(): Payload | null {
  const el = document.getElementById(PAYLOAD_ID);
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as Payload;
  } catch {
    // 심어 둔 값이 깨졌으면 그냥 처음부터 그린다. 화면이 죽는 것보다 낫다.
    return null;
  }
}

const payload = readPayload();

let initial: AppData | null = null;
if (payload) {
  try {
    initial = buildAppData(payload.data);
  } catch {
    initial = null;
  }
}

function Tree({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <RouterProvider initialHref={window.location.href}>
        {/*
          첫 렌더의 '오늘' 은 반드시 서버가 쓴 값이어야 한다. 진짜 오늘로 시작하면
          사흘 지난 빌드에서 상태 배지가 전부 어긋나고 React 가 트리를 통째로 버린다.
          TodayProvider 가 이펙트에서 진짜 오늘로 바꾼다.
        */}
        <TodayProvider initial={payload?.buildDate ?? today()}>{children}</TodayProvider>
      </RouterProvider>
    </StrictMode>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('#root 를 찾지 못했습니다');

const tree = (
  <Tree>
    <DataProvider initial={initial} initialScope={initial ? (payload?.scope ?? 'static') : 'static'}>
      <App />
    </DataProvider>
  </Tree>
);

// 사전 렌더된 내용이 있으면 붙이고, 없으면(개발 서버) 새로 그린다.
if (initial && container.firstElementChild) {
  hydrateRoot(container, tree, {
    onRecoverableError(error, info) {
      console.error('[hydrate]', error, info.componentStack);
    },
  });
} else {
  createRoot(container).render(tree);
}
