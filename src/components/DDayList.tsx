import { useEffect, useRef } from 'react';
import type { DDayItem } from '../lib/plan.ts';
import { dotted } from '../lib/dates.ts';

/** `D-9` · `D-DAY` */
export function ddayLabel(n: number): string {
  return n === 0 ? 'D-DAY' : `D-${n}`;
}

/** 카드로 세울 개수. 이보다 뒤는 리스트로 흐른다 — 카드가 늘어나면 급한 것이 안 급해진다. */
const CARD_COUNT = 4;

/**
 * 다가오는 일정. 가까운 것 몇 개는 카드로 세우고 나머지는 리스트로 잇는다.
 *
 * 같은 항목을 카드와 리스트에 겹쳐 싣지 않는다. 두 번 보이면 개수를 세게 되고,
 * 그 순간 "가장 급한 것" 이라는 정보가 사라진다.
 *
 * 접수 마감도 카드에 올린다. 접수를 놓치면 시험을 아예 못 보므로 시험일보다 급할 때가
 * 있고, 실제로 접수 기간은 보통 4일뿐이다. 대신 액센트는 맨 앞 한 장에만 쓴다.
 */
export function DDaySection({ items }: { items: DDayItem[] }) {
  const strip = useRef<HTMLUListElement>(null);
  const lead = items[0]?.id ?? '';

  /**
   * 목록이 바뀌면 맨 앞으로 되돌린다.
   *
   * 모바일에서 카드가 가로 스크롤이라, 종목을 하나 추가하면 브라우저의 스크롤 스냅이
   * 직전 위치를 유지하려 애쓰다가 **가장 급한 카드를 화면 밖으로 밀어낸다** (실측:
   * 종목 5개를 고르고 나면 scrollLeft 가 278px). 이 카드 줄의 존재 이유가 맨 앞
   * 한 장이므로 위치를 지키는 것보다 되돌리는 쪽이 맞다.
   */
  useEffect(() => {
    strip.current?.scrollTo({ left: 0 });
  }, [lead, items.length]);

  if (!items.length) {
    return (
      <p className="empty">
        시험을 고르고 응시일을 정하면 여기에 D-Day가 가까운 순으로 쌓여요.
      </p>
    );
  }

  const cards = items.slice(0, CARD_COUNT);
  const rest = items.slice(CARD_COUNT);

  return (
    <>
      <ul className="ddcards" ref={strip}>
        {cards.map((it, i) => (
          <li
            key={it.id}
            className={`ddcard ${i === 0 ? 'ddcard--lead' : ''} ${it.kind === 'exam' ? 'ddcard--exam' : 'ddcard--reg'}`}
          >
            <span className="ddcard__exam">{it.examName}</span>
            <span className="ddcard__kind">{it.label}</span>
            <span className="ddcard__num mono">{ddayLabel(it.dday)}</span>
            <span className="ddcard__date mono">{dotted(it.date)}</span>
          </li>
        ))}
      </ul>

      {rest.length > 0 && <DDayList items={rest} />}
    </>
  );
}

export function DDayList({ items }: { items: DDayItem[] }) {
  return (
    <ul className="dday">
      {items.map(it => (
        <li
          key={it.id}
          className={`dday__item ${it.kind === 'exam' ? 'dday__item--exam' : 'dday__item--reg'}`}
        >
          <span className="dday__num mono">{ddayLabel(it.dday)}</span>
          <span className="dday__what">
            <span className="dday__exam">{it.examName}</span>{' '}
            <span className="dday__kind">{it.label}</span>
          </span>
          <span className="dday__date mono">{dotted(it.date)}</span>
        </li>
      ))}
    </ul>
  );
}
