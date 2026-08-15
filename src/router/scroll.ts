/**
 * 스크롤 복원. 화면정의 §17.2 — "뒤로 가기를 눌렀을 때 검색 결과와 스크롤 위치가
 * 가능한 범위에서 복원되어야 한다".
 *
 * 두 가지가 까다롭다.
 *
 * 1. **브라우저 자동 복원을 꺼야 한다.** 켜져 있으면 브라우저가 React 가 다시
 *    그리기 **전에** 복원해서 아직 짧은 문서 위에 스크롤하고, 결과적으로 맨 위로
 *    떨어진다. `history.scrollRestoration = 'manual'` 로 우리가 시점을 잡는다.
 *
 * 2. **마운트 시점에 복원하면 안 된다.** 목록은 데이터가 도착해야 높이가 생긴다.
 *    사전 렌더 조각으로 먼저 그린 다음 전체 데이터가 오면 문서가 길어지므로,
 *    `ready` 가 참이 된 뒤에 복원한다.
 */

import { useEffect, useRef } from 'react';

const STORE_PREFIX = 'exammoa.scroll:';
const STATE_KEY = '__exammoaKey';

function readKey(): string | null {
  const state: unknown = window.history.state;
  if (state && typeof state === 'object' && STATE_KEY in state) {
    const key = (state as Record<string, unknown>)[STATE_KEY];
    if (typeof key === 'string') return key;
  }
  return null;
}

/** 히스토리 항목마다 열쇠를 하나 붙인다. 같은 주소라도 다른 항목이면 다른 위치다 */
function ensureKey(): string {
  const existing = readKey();
  if (existing) return existing;
  const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const state: unknown = window.history.state;
  const next = state && typeof state === 'object' ? { ...state, [STATE_KEY]: key } : { [STATE_KEY]: key };
  window.history.replaceState(next, '');
  return key;
}

function save(key: string, y: number): void {
  try {
    window.sessionStorage.setItem(`${STORE_PREFIX}${key}`, String(y));
  } catch {
    // 시크릿 모드에서 던진다. 스크롤 복원이 안 되는 것은 화면을 못 쓰는 것보다 낫다.
  }
}

function load(key: string): number | null {
  try {
    const raw = window.sessionStorage.getItem(`${STORE_PREFIX}${key}`);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * @param href 지금 주소. 바뀌면 새 화면이다
 * @param ready 목록에 높이가 생겼는가. 데이터 로딩이 끝났을 때 참으로 준다
 */
export function useScrollRestoration(href: string, ready: boolean): void {
  const previous = useRef<{ key: string; href: string } | null>(null);

  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';

    // 탭을 닫거나 다른 사이트로 갈 때. unload 가 아니라 pagehide 여야 bfcache 를 막지 않는다.
    const onHide = () => {
      const key = readKey();
      if (key) save(key, window.scrollY);
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  useEffect(() => {
    // 떠나기 직전의 위치를 그 항목의 열쇠에 적어 둔다.
    const before = previous.current;
    if (before && before.href !== href) save(before.key, window.scrollY);

    const key = ensureKey();
    previous.current = { key, href };

    if (!ready) return;

    const saved = load(key);
    if (saved !== null) {
      window.scrollTo(0, saved);
      return;
    }

    // 새 화면이면 맨 위로. 다만 #앵커가 있으면 브라우저 기본 동작을 흉내 낸다.
    const hash = window.location.hash.slice(1);
    if (hash) {
      const target = document.getElementById(decodeURIComponent(hash));
      if (target) {
        target.scrollIntoView();
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [href, ready]);
}
