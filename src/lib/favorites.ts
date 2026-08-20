import { useCallback, useMemo, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'exammoa:favorites';
const CHANGE_EVENT = 'exammoa:favorites-change';

/**
 * The approved home concept is shown with a small starter shortlist. People can
 * remove every item immediately; after the first edit their own list is the only
 * source of truth.
 */
export const DEFAULT_FAVORITES = [
  '컴퓨터활용능력1급',
  'KBS한국어능력시험',
  '정보처리기사',
] as const;

const DEFAULT_SNAPSHOT = JSON.stringify(DEFAULT_FAVORITES);

function readSnapshot(): string {
  if (typeof window === 'undefined') return DEFAULT_SNAPSHOT;
  return window.localStorage.getItem(STORAGE_KEY) ?? DEFAULT_SNAPSHOT;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function parseSnapshot(snapshot: string): string[] {
  try {
    const value = JSON.parse(snapshot) as unknown;
    if (!Array.isArray(value)) return [...DEFAULT_FAVORITES];
    return value.filter((item): item is string => typeof item === 'string');
  } catch {
    return [...DEFAULT_FAVORITES];
  }
}

function writeFavorites(next: string[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useFavorites() {
  const snapshot = useSyncExternalStore(subscribe, readSnapshot, () => DEFAULT_SNAPSHOT);
  const favorites = useMemo(() => parseSnapshot(snapshot), [snapshot]);

  const toggle = useCallback((slug: string) => {
    const current = parseSnapshot(readSnapshot());
    writeFavorites(current.includes(slug)
      ? current.filter(item => item !== slug)
      : [...current, slug]);
  }, []);

  const clear = useCallback(() => writeFavorites([]), []);

  return { favorites, toggle, clear };
}
