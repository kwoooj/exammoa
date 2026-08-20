import type { EventTiming } from '../types.ts';
import { clockLabel, rangeLabel } from '../lib/dates.ts';

interface Props {
  start: string;
  end: string;
  timing?: EventTiming;
  style?: 'full' | 'short';
}

function dateTimeValue(date: string, time?: string): string {
  return time ? `${date}T${time}:00+09:00` : date;
}

function TimeStatus({ timing }: { timing: EventTiming }) {
  if (timing.status === 'varies') return <>{timing.note ?? '시험장별 시간 상이'}</>;
  if (timing.status === 'select-on-booking') return <>{timing.note ?? '접수 시 시간 선택'}</>;
  return null;
}

/** 날짜와 공식 시각을 한 단위로 렌더링한다. 시각이 없으면 기존 날짜 표기를 유지한다. */
export function EventDateTime({ start, end, timing, style = 'full' }: Props) {
  const label = rangeLabel(start, end, style);
  const [startLabel, endLabel] = label.split(' ~ ');

  if (!timing) return <time dateTime={start === end ? start : undefined}>{label}</time>;
  if (timing.status !== 'confirmed') {
    return (
      <>
        <time dateTime={start === end ? start : undefined}>{label}</time>
        {' · '}<TimeStatus timing={timing} />
      </>
    );
  }

  if (start === end) {
    return (
      <>
        <time dateTime={dateTimeValue(start, timing.start)}>
          {startLabel}{timing.start && <> · {clockLabel(timing.start)}</>}
        </time>
        {timing.end && (
          <> ~ <time dateTime={dateTimeValue(end, timing.end)}>{clockLabel(timing.end)}</time></>
        )}
      </>
    );
  }

  return (
    <>
      <time dateTime={dateTimeValue(start, timing.start)}>
        {startLabel}{timing.start && <> {clockLabel(timing.start)}</>}
      </time>
      {' ~ '}
      <time dateTime={dateTimeValue(end, timing.end)}>
        {endLabel}{timing.end && <> {clockLabel(timing.end)}</>}
      </time>
    </>
  );
}
