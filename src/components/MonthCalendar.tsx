import type { DDayItem } from '../lib/plan.ts';
import { WEEKDAYS, groupByDate, monthGrid, monthLabel, monthsBetween, calendarRange } from '../lib/calendar.ts';

interface Props {
  items: DDayItem[];
  today: string;
  /** 그릴 달의 상한. 너무 멀리까지 그리면 스크롤만 길어진다 */
  maxMonths?: number;
}

/**
 * 월간 캘린더.
 *
 * 원래 `README.md` 는 월간 격자를 금지했다. 근거는 "원서접수는 기간이고 시험도 기간인데
 * 격자가 둘을 같은 칸에 뭉갠다" 였다. 그 근거는 충돌 판정 모델의 것이고, D-Day 모델에서는
 * 사용자가 응시일을 **지정**하므로 찍을 것이 점 몇 개뿐이라 뭉개질 것이 없다.
 *
 * 그리는 목적도 다르다. 사용자는 자기 일정을 월 단위 격자로 기억하므로(구글 캘린더 등),
 * 대조하려면 같은 형태여야 한다.
 */
export function MonthCalendar({ items, today, maxMonths = 8 }: Props) {
  const range = calendarRange(items.map(i => i.date), today);
  if (!range) {
    return <p className="empty">응시일을 정하면 달력에 표시돼요.</p>;
  }

  const byDate = groupByDate(items);
  const months = monthsBetween(`${range.from}-01`, `${range.to}-01`, maxMonths);

  return (
    <div className="cal">
      {months.map(m => (
        <section className="cal__month" key={m}>
          <h3 className="cal__title">{monthLabel(m)}</h3>
          <div className="cal__grid" role="grid" aria-label={monthLabel(m)}>
            {WEEKDAYS.map((w, i) => (
              <div
                key={w}
                className={`cal__wd ${i >= 5 ? 'cal__wd--weekend' : ''}`}
                role="columnheader"
              >
                {w}
              </div>
            ))}
            {monthGrid(m).flat().map(cell => {
              const marks = byDate.get(cell.date) ?? [];
              const isToday = cell.date === today;
              const classes = [
                'cal__day',
                cell.inMonth ? '' : 'cal__day--out',
                isToday ? 'cal__day--today' : '',
                marks.length ? 'cal__day--marked' : '',
              ].filter(Boolean).join(' ');

              return (
                <div key={cell.date} className={classes} role="gridcell">
                  <span className="cal__num mono">{cell.day}</span>
                  {marks.map(mk => (
                    <span
                      key={mk.id}
                      className={`cal__mark ${mk.kind === 'exam' ? 'cal__mark--exam' : 'cal__mark--reg'}`}
                      // 칸이 좁아 라벨을 줄이므로 전체 내용을 title 로도 남긴다
                      title={`${mk.examName} ${mk.label}`}
                    >
                      {mk.examName}
                      <span className="cal__markKind">
                        {mk.kind === 'exam' ? ' 시험' : ' 접수마감'}
                      </span>
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <p className="cal__legend small muted">
        <span className="cal__mark cal__mark--exam cal__mark--sample" /> 시험일{'   '}
        <span className="cal__mark cal__mark--reg cal__mark--sample" /> 원서접수 마감
      </p>
    </div>
  );
}
