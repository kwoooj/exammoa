/**
 * 데이터 상태. 사전 렌더 조각으로 시작해 전체로 넓힌다.
 *
 * 조각은 전체의 **부분집합**이라 교체가 안전하다. 이미 그려 둔 행은 그대로 있고
 * 없던 행이 붙을 뿐이다. 그래서 §15.1 이 금지한 "전체 페이지를 스피너 하나로
 * 막는" 일이 생기지 않는다 — 사전 렌더된 페이지는 처음부터 내용이 차 있다.
 *
 * 개발 서버에는 사전 렌더가 없어서 조각도 없다. 그때만 스켈레톤을 그린다.
 *
 * §15.3 이 요구한 두 실패의 구분이 여기서 갈린다. **화면 로딩 실패**는 이 파일이
 * 다루고 다시 시도 버튼을 준다. **수집 실패**는 정상적으로 받아 온 `meta.sources`
 * 안에 있고 `freshness.ts` 가 읽는다 — 데이터는 멀쩡히 도착했는데 그 내용이 낡은
 * 것이므로 다시 시도할 대상이 아니다.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppData } from './index.ts';
import { buildAppData } from './index.ts';
import { DataError, httpReader, loadRaw } from './source.ts';
import type { Scope } from './slice.ts';

export interface DataState {
  status: 'loading' | 'ready' | 'error';
  /** 조각이라도 있으면 그린다. null 일 때만 스켈레톤 */
  data: AppData | null;
  /** 지금 들고 있는 데이터의 범위 */
  scope: Scope;
  error: string | null;
  retry: () => void;
}

const Context = createContext<DataState | null>(null);

export interface DataProviderProps {
  /** 사전 렌더가 심어 준 조각. 없으면 null */
  initial: AppData | null;
  initialScope: Scope;
  /** 전체 데이터를 받아오지 않는다 (사전 렌더 중). 테스트와 SSR 에서만 쓴다 */
  static?: boolean;
  children: ReactNode;
}

export function DataProvider({ initial, initialScope, static: isStatic, children }: DataProviderProps) {
  const [data, setData] = useState<AppData | null>(initial);
  const [scope, setScope] = useState<Scope>(initialScope);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    setAttempt(n => n + 1);
  }, []);

  useEffect(() => {
    if (isStatic || scope === 'full') return;
    let alive = true;

    loadRaw(httpReader)
      .then(raw => {
        if (!alive) return;
        setData(buildAppData(raw));
        setScope('full');
        setError(null);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        // 조각이라도 있으면 화면은 그대로 두고 조용히 넘어간다. 사전 렌더된
        // 내용이 이미 유효한데 "다시 시도" 를 띄우면 멀쩡한 화면을 오류처럼 만든다.
        const message = e instanceof DataError ? e.message : '일정을 불러오지 못했어요.';
        if (initial === null) setError(message);
      });

    return () => { alive = false; };
  }, [attempt, isStatic, scope, initial]);

  const value = useMemo<DataState>(() => ({
    status: error ? 'error' : scope === 'full' ? 'ready' : 'loading',
    data,
    scope,
    error,
    retry,
  }), [data, scope, error, retry]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useDataState(): DataState {
  const value = useContext(Context);
  if (!value) throw new Error('DataProvider 안에서만 쓸 수 있습니다');
  return value;
}

/** 데이터가 있다고 확신하는 자리에서. 없으면 던진다 */
export function useAppData(): AppData {
  const { data } = useDataState();
  if (!data) throw new Error('데이터가 아직 없습니다. useDataState 로 상태를 먼저 확인하세요');
  return data;
}
