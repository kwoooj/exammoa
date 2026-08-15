/**
 * 달 이동과 범례.
 *
 * 범례가 필요한 이유는 §3.2 다 — 색상만으로 상태를 구분하지 않는다. 접수·시험·발표를
 * 모양으로 나눠 그렸으면 그 모양이 무엇인지 글자로 말해 줘야 한다.
 */

import { monthLabel, shiftMonth } from '../../lib/calendar.ts';
import type { YearMonth } from '../../lib/calendar.ts';
import type { EventKind } from '../../types.ts';

interface NavProps {
  month: YearMonth;
  today: string;
  onChange: (month: YearMonth) => void;
  /** 이 범위 밖으로는 못 나간다. 없으면 제한 없음 */
  min?: YearMonth;
  max?: YearMonth;
}

export function MonthNav({ month, today, onChange, min, max }: NavProps) {
  const thisMonth = today.slice(0, 7);
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);

  return (
    <div className="cal__nav">
      <button
        type="button"
        className="cal__navBtn"
        onClick={() => onChange(prev)}
        disabled={min !== undefined && prev < min}
        aria-label={`${monthLabel(prev)} 보기`}
      >
        ‹
      </button>
      {/* 제목이 살아 있는 영역이어야 스크린리더가 달이 바뀐 것을 읽어 준다 */}
      <p className="cal__title" aria-live="polite">{monthLabel(month)}</p>
      <button
        type="button"
        className="cal__navBtn"
        onClick={() => onChange(next)}
        disabled={max !== undefined && next > max}
        aria-label={`${monthLabel(next)} 보기`}
      >
        ›
      </button>
      {month !== thisMonth && (
        <button type="button" className="btn btn--ghost" onClick={() => onChange(thisMonth)}>
          이번 달
        </button>
      )}
    </div>
  );
}

/**
 * 모양이 무엇을 뜻하는지 글자로 적는다 (§3.2 — 색상만으로 구분하지 않는다).
 *
 * 추가접수가 목록에 있는 이유: 정기접수와 점선으로만 갈라 두면 그 점선이 무슨
 * 뜻인지 알 길이 없다. 모양을 나눴으면 이름도 줘야 한다.
 */
const LEGEND: { key: string; cls: string; text: string }[] = [
  { key: 'reg', cls: 'cal__bar--reg', text: '접수' },
  { key: 'extra', cls: 'cal__bar--reg cal__bar--extra', text: '추가접수' },
  { key: 'exam', cls: 'cal__bar--exam', text: '시험' },
  { key: 'result', cls: 'cal__bar--result', text: '발표' },
];

export function CalendarLegend({ show }: { show?: (EventKind | 'extra')[] }) {
  const items = show ? LEGEND.filter(l => show.includes(l.key as EventKind | 'extra')) : LEGEND;
  return (
    <p className="cal__legend small muted">
      {items.map(item => (
        <span key={item.key} className="cal__legendItem">
          <span className={`cal__bar cal__bar--sample ${item.cls}`} aria-hidden="true" />
          {item.text}
        </span>
      ))}
    </p>
  );
}
