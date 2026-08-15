/**
 * 월간 격자. 화면정의 §7.5 · §8.5 · §14.
 *
 * 기하는 `lib/monthbars.ts` 가 이미 정수로 계산해 뒀다. 여기서는 그 숫자를 CSS
 * 그리드 좌표로 옮기기만 한다 — 컴포넌트 안에서 날짜를 계산하지 않는다. `.tsx` 는
 * `node --test` 가 못 읽어서 여기 들어간 계산은 영원히 검증되지 않는다.
 *
 * **주 단위 그리드**를 쓴다. 월 전체를 7열 그리드 하나로 만들면 기간 막대가 주
 * 경계를 넘을 때 칸 사이를 가로지를 방법이 없다. 주마다 별도 그리드를 두고 막대를
 * `grid-column: 시작 / span 길이` 로 놓으면, 다음 주 그리드의 같은 레인 첫 칸에서
 * 이어지므로 하나의 막대로 읽힌다.
 *
 * **`role="grid"` 를 쓰지 않는다.** 예전 달력이 roving tabindex 도 화살표 키 처리도
 * 없이 `role="grid"` 를 선언했다. 없는 내비게이션을 있다고 알리는 것은 아무 역할도
 * 안 주는 것보다 나쁘다. 표 의미론은 아래 날짜순 표(§8.10)가 맡는다.
 */

import type { CSSProperties } from 'react';
import type { MonthLayout } from '../../lib/monthbars.ts';
import type { CalendarEvent } from '../../lib/calevents.ts';
import { barAriaLabel } from '../../lib/calevents.ts';
import type { ColorIndex } from '../../lib/calcolors.ts';
import { NEUTRAL, colorClass } from '../../lib/calcolors.ts';
import { WEEKDAYS, monthLabel } from '../../lib/calendar.ts';
import { monthDay } from '../../lib/dates.ts';

export type CalendarSelection =
  | { kind: 'day'; date: string }
  | { kind: 'bar'; eventId: string }
  | null;

interface Props {
  layout: MonthLayout;
  eventById: ReadonlyMap<string, CalendarEvent>;
  today: string;
  selection?: CalendarSelection;
  onSelectDay?: (date: string) => void;
  onSelectBar?: (eventId: string) => void;
  /** 홈 미리보기용 축소판 */
  compact?: boolean;
  ariaLabel?: string;
  /** 그룹 → 색 번호. 없으면 전부 중립색 (lib/calcolors.ts) */
  colorOf?: ReadonlyMap<string, ColorIndex>;
}

function barClass(
  seg: MonthLayout['weeks'][number]['segments'][number],
  event: CalendarEvent | undefined,
  color: ColorIndex,
  selected: boolean,
): string {
  const c = ['cal__bar', `cal__bar--${seg.kind}`];
  // 추가접수·빈자리접수·취소좌석은 점선으로 갈라 둔다. 정기접수와 같아 보이면
  // 이미 지난 접수로 읽고 남은 기회를 놓친다 (§7.5).
  if (event && event.kind === 'reg' && event.seq >= 2) c.push('cal__bar--extra');
  if (seg.isPoint) c.push('cal__bar--point');
  if (seg.past) c.push('cal__bar--past');
  if (seg.ongoing) c.push('cal__bar--ongoing');
  // 각진 모서리와 홑화살표로 "이어진다" 를 말한다. 색이 아니다 (§3.2).
  if (seg.continuesLeft) c.push('cal__bar--openL');
  if (seg.continuesRight) c.push('cal__bar--openR');
  if (selected) c.push('cal__bar--selected');
  const hue = colorClass(color);
  if (hue) c.push(hue);
  return c.join(' ');
}

export function MonthGrid({
  layout, eventById, today, selection, onSelectDay, onSelectBar, compact, ariaLabel, colorOf,
}: Props) {
  const label = ariaLabel ?? `${monthLabel(layout.month)} 시험 일정`;

  return (
    <div className={compact ? 'cal cal--compact' : 'cal'} role="group" aria-label={label}>
      <div className="cal__wds" aria-hidden="true">
        {WEEKDAYS.map((w, i) => (
          <span key={w} className={i >= 5 ? 'cal__wd cal__wd--weekend' : 'cal__wd'}>{w}</span>
        ))}
      </div>

      {layout.weeks.map(week => {
        // 넘침 배지도 한 줄을 차지한다. 날짜 줄 + 레인 + (넘침)
        const rows = week.laneCount + (week.overflow.length > 0 ? 1 : 0);
        const overflowRow = week.laneCount + 2;

        return (
          <div
            key={week.weekIndex}
            className="cal__week"
            style={{ '--lanes': rows } as CSSProperties}
            role="group"
            aria-label={`${monthDay(week.days[0]!.date)} 주`}
          >
            {week.days.map((cell, col) => {
              const count = week.segments.filter(s => {
                const from = week.days[s.colStart]!.date;
                const to = week.days[Math.min(6, s.colStart + s.span - 1)]!.date;
                return from <= cell.date && cell.date <= to;
              }).length + (week.overflow.find(o => o.date === cell.date)?.count ?? 0);

              const classes = ['cal__day'];
              if (!cell.inMonth) classes.push('cal__day--out');
              if (cell.date === today) classes.push('cal__day--today');
              if (selection?.kind === 'day' && selection.date === cell.date) classes.push('cal__day--selected');

              return (
                <button
                  key={cell.date}
                  type="button"
                  className={classes.join(' ')}
                  style={{ gridColumn: col + 1 }}
                  // 모바일에서는 막대(18px)가 아니라 이 칸이 터치 타깃이다 (§8.13).
                  // 빗맞은 탭도 그 날짜의 일정을 열어 준다.
                  onClick={onSelectDay ? () => onSelectDay(cell.date) : undefined}
                  disabled={!onSelectDay}
                  aria-pressed={selection?.kind === 'day' && selection.date === cell.date}
                  aria-label={`${monthDay(cell.date)}${count ? `, 일정 ${count}건` : ', 일정 없음'}`}
                >
                  {/* 기계 판독 가능한 날짜 (§14) */}
                  <time className="cal__num" dateTime={cell.date}>{cell.day}</time>
                  {cell.date === today && <span className="sr-only">오늘</span>}
                </button>
              );
            })}

            {week.segments.map(seg => {
              const event = eventById.get(seg.eventId);
              const selected = selection?.kind === 'bar' && selection.eventId === seg.eventId;
              const style: CSSProperties = {
                gridColumn: `${seg.colStart + 1} / span ${seg.span}`,
                gridRow: seg.lane + 2,
              };
              const name = event ? barAriaLabel(event, today) : seg.text;

              return (
                <button
                  key={seg.key}
                  type="button"
                  className={barClass(seg, event, colorOf?.get(event?.groupId ?? '') ?? NEUTRAL, selected)}
                  style={style}
                  onClick={onSelectBar ? () => onSelectBar(seg.eventId) : undefined}
                  disabled={!onSelectBar}
                  aria-label={name}
                  aria-pressed={selected}
                >
                  {/*
                    라벨은 이벤트당 한 번만 — 이어지는 칸에 이름을 반복하지 않는다.
                    하루짜리라고 점으로 만들지 않는다. 점은 누르기 전까지 무엇인지
                    알 수 없어서, 시험일이 찍힌 달력이 아니라 얼룩이 된다.
                    좁으면 글자가 잘리지만 잘린 글자가 없는 글자보다 낫다.
                  */}
                  {seg.showLabel && <span className="cal__barText">{seg.text}</span>}
                </button>
              );
            })}

            {week.overflow.map(o => {
              const col = week.days.findIndex(d => d.date === o.date);
              return (
                <button
                  key={o.date}
                  type="button"
                  className="cal__more"
                  style={{ gridColumn: col + 1, gridRow: overflowRow }}
                  onClick={onSelectDay ? () => onSelectDay(o.date) : undefined}
                  disabled={!onSelectDay}
                  // span 이 아니라 button 이다. 접힌 일정에 키보드로 닿는 유일한 길이다.
                  aria-label={`${monthDay(o.date)} 일정 ${o.count}건 더 보기`}
                >
                  외 {o.count}건
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
