import type { DDayItem } from '../lib/plan.ts';
import { dotted } from '../lib/dates.ts';

/** `D-9` · `D-DAY` */
export function ddayLabel(n: number): string {
  return n === 0 ? 'D-DAY' : `D-${n}`;
}

export function DDayList({ items }: { items: DDayItem[] }) {
  if (!items.length) {
    return (
      <p className="empty">
        시험을 고르고 응시일을 정하면 여기에 D-Day가 가까운 순으로 쌓여요.
      </p>
    );
  }

  return (
    <ul className="dday">
      {items.map(it => (
        <li
          key={it.id}
          className={`dday__item ${it.kind === 'exam' ? 'dday__item--exam' : 'dday__item--reg'}`}
        >
          <span className={`dday__num mono ${it.dday === 0 ? 'dday__num--today' : ''}`}>
            {ddayLabel(it.dday)}
          </span>
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
