/**
 * '오늘' 을 한 곳에서 준다.
 *
 * 사전 렌더한 HTML 은 **빌드한 날의 오늘**로 그려져 있다. 사흘 뒤에 그 페이지를
 * 여는 사람의 브라우저가 진짜 오늘로 그리면, 상태 배지·D-Day·기본 달이 전부
 * 서버가 만든 글자와 달라진다. React 19 는 그런 불일치를 만나면 사전 렌더한 트리를
 * **통째로 버리고** 다시 그린다 — 사전 렌더가 준 이득이 사라진다.
 *
 * 그래서 두 번 그린다. 첫 렌더는 빌드 날짜로(서버가 만든 글자와 정확히 같다),
 * 그다음 이펙트에서 진짜 오늘로 바꾼다. 렌더 한 번이 더 들고 불일치는 0 이다.
 *
 * **컴포넌트가 `today()` 를 직접 부르지 않는다.** 한 곳이라도 직접 부르면 그 부분만
 * 불일치를 만들고, 그것이 트리 전체를 버리게 한다. 리뷰에서 볼 규칙이다.
 */

import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { today } from '../lib/dates.ts';

const TodayContext = createContext<string | null>(null);

export function TodayProvider({ initial, children }: { initial: string; children: ReactNode }) {
  const [value, setValue] = useState(initial);

  useEffect(() => {
    const real = today();
    if (real !== value) setValue(real);
    // 자정을 넘겨 페이지를 열어 둔 경우까지 쫓지는 않는다. 그 정도로 오래 열어 둔
    // 화면은 어차피 데이터도 낡았고, 타이머를 두면 시험 중에 화면이 바뀐다.
  }, [value]);

  return <TodayContext.Provider value={value}>{children}</TodayContext.Provider>;
}

export function useToday(): string {
  const value = useContext(TodayContext);
  if (!value) throw new Error('TodayProvider 안에서만 쓸 수 있습니다');
  return value;
}
