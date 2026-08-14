import { useState } from 'react';
import type { DDayItem } from '../lib/plan.ts';
import { WEEKDAYS, groupByDate, monthGrid, monthLabel, shiftMonth, ym } from '../lib/calendar.ts';

interface Props {
  items: DDayItem[];
  today: string;
}

/**
 * 월간 달력. **한 달만** 보여주고 좌우로 넘긴다.
 *
 * 계획이 있는 달을 전부 세로로 늘어놓으면 화면이 길어지고, 사용자가 쓰는 캘린더와
 * 나란히 놓고 보기 어렵다. 실제 캘린더 앱과 같은 형태여야 대조가 된다.
 *
 * 보고 있는 달은 표시용 상태다. 넘겨도 계획은 바뀌지 않는다.
 */
export function MonthCalendar({ items, today }: Props) {
  const [month, setMonth] = useState(() => ym(today));
  const byDate = groupByDate(items);
  const cells = monthGrid(month).flat();

  /**
   * 화면에 실제로 그려진 표시가 있는가.
   *
   * `ym(i.date) === month` 로 세면 안 된다. 격자는 앞뒤 달의 날짜도 그리고 거기에도
   * 칩이 붙는다 — 9/2 칩이 8월 격자 끝에 보이는데 "이 달에는 표시할 일정이 없어요"
   * 가 함께 뜬다 (실측). 안내문이 눈에 보이는 것과 어긋나면 안 된다.
   */
  const visibleMarks = cells.reduce((n, c) => n + (byDate.get(c.date)?.length ?? 0), 0);
  const isCurrent = month === ym(today);

  return (
    <div className="cal">
      <div className="cal__nav">
        <button type="button" className="cal__navBtn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="이전 달">
          ‹
        </button>
        <h3 className="cal__title" aria-live="polite">{monthLabel(month)}</h3>
        <button type="button" className="cal__navBtn" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="다음 달">
          ›
        </button>
        {!isCurrent && (
          <button type="button" className="linkbtn cal__todayBtn" onClick={() => setMonth(ym(today))}>
            오늘로
          </button>
        )}
      </div>

      <div className="cal__grid" role="grid" aria-label={monthLabel(month)}>
        {WEEKDAYS.map((wd, i) => (
          <div key={wd} className={`cal__wd ${i >= 5 ? 'cal__wd--weekend' : ''}`} role="columnheader">
            {wd}
          </div>
        ))}
        {cells.map(cell => {
          const marks = byDate.get(cell.date) ?? [];
          const classes = [
            'cal__day',
            cell.inMonth ? '' : 'cal__day--out',
            cell.date === today ? 'cal__day--today' : '',
            marks.length ? 'cal__day--marked' : '',
          ].filter(Boolean).join(' ');

          return (
            <div key={cell.date} className={classes} role="gridcell">
              <span className="cal__num mono">{cell.day}</span>
              {marks.map(mk => (
                <span
                  key={mk.id}
                  className={`cal__mark ${mk.kind === 'exam' ? 'cal__mark--exam' : 'cal__mark--reg'}`}
                  title={`${mk.examName} ${mk.label}`}
                >
                  {mk.examName}
                  <span className="cal__markKind">{mk.kind === 'exam' ? ' 시험' : ' 접수마감'}</span>
                </span>
              ))}
            </div>
          );
        })}
      </div>

      <p className="cal__legend small muted">
        <span className="cal__mark cal__mark--exam cal__mark--sample" /> 시험일
        <span className="cal__mark cal__mark--reg cal__mark--sample" /> 원서접수 마감
        {visibleMarks === 0 && <span className="cal__none">이 달에는 표시할 일정이 없어요</span>}
      </p>
    </div>
  );
}
