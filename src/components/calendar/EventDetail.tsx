/**
 * 선택한 날짜·막대의 상세. 화면정의 §8.6 · §8.8.
 *
 * 같은 내용이 S-03 에서는 달력 아래 블록으로, S-04 에서는 우측 패널과 하단 시트로
 * 나온다. 몸통을 한 벌만 두는 이유는 세 곳이 서로 다른 말을 하기 시작하면 어느
 * 쪽이 맞는지 알 수 없기 때문이다.
 *
 * **접힌 종목을 전부 나열한다.** 시행그룹으로 막대를 접으면 사용자가 고른 시험이
 * 사라진 것처럼 보인다 (§8.8). `외 3개` 라고 요약해 두고 여기서 다시 요약하면
 * 아무 데서도 확인할 수 없다.
 */

import type { CalendarEvent } from '../../lib/calevents.ts';
import { stateOf } from '../../lib/calevents.ts';
import { rangeLabel } from '../../lib/dates.ts';
import { ExternalLink } from '../../router/Link.tsx';
import { examPath } from '../../lib/routes.ts';
import { Link } from '../../router/Link.tsx';

const STATE_TEXT = { past: '종료', ongoing: '진행 중', today: '오늘', upcoming: '예정' } as const;

interface Props {
  /** 막대를 골랐을 때 */
  event?: CalendarEvent | undefined;
  /** 날짜를 골랐을 때 그날의 전부 */
  dayEvents?: CalendarEvent[];
  date?: string | undefined;
  today: string;
  /** slug → 화면에 쓸 이름 */
  nameOf: (slug: string) => string;
}

function OneEvent({ event, today, nameOf }: { event: CalendarEvent; today: string; nameOf: (s: string) => string }) {
  const state = stateOf(event, today);
  return (
    <div className="evt">
      <p className="evt__session small muted">{event.sessionLabel}</p>
      <p className="evt__name">{event.displayName}</p>
      <p className="evt__when">
        {event.kindLabel} · {rangeLabel(event.start, event.end)}
        {' · '}
        <span className="evt__state">{STATE_TEXT[state]}</span>
      </p>
      {event.note && <p className="small muted">{event.note}</p>}

      {event.examSlugs.length > 1 && (
        <details className="evt__folded">
          {/* 선택이 사라졌다고 오해하지 않게, 접힌 종목을 요약하지 않고 전부 적는다 */}
          <summary className="small">이 일정을 함께 쓰는 시험 {event.examSlugs.length}개</summary>
          <ul className="evt__list">
            {event.examSlugs.map(slug => (
              <li key={slug}><Link to={examPath(slug)}>{nameOf(slug)}</Link></li>
            ))}
          </ul>
        </details>
      )}

      <p className="row">
        {event.applyUrl && (
          <ExternalLink href={event.applyUrl} label={`${event.agency} ${event.displayName} ${event.applyLabel ?? '원서접수'} 새 창 열기`} className="btn btn--primary">
            {event.applyLabel ?? '원서접수'}
          </ExternalLink>
        )}
        {event.agencyUrl && (
          <ExternalLink href={event.agencyUrl} label={`${event.agency} ${event.displayName} 공식 시험정보 새 창 열기`} className="btn">
            공식 정보
          </ExternalLink>
        )}
      </p>
    </div>
  );
}

export function EventDetail({ event, dayEvents, date, today, nameOf }: Props) {
  if (event) {
    return (
      <aside className="cal__panel" aria-live="polite" aria-label="선택한 일정">
        <OneEvent event={event} today={today} nameOf={nameOf} />
      </aside>
    );
  }

  if (date) {
    const list = dayEvents ?? [];
    return (
      <aside className="cal__panel" aria-live="polite" aria-label="선택한 날짜의 일정">
        <p className="evt__date">{rangeLabel(date, date)}</p>
        {list.length === 0 ? (
          <p className="muted small">이 날에는 공식 일정이 없어요.</p>
        ) : (
          list.map(e => <OneEvent key={e.id} event={e} today={today} nameOf={nameOf} />)
        )}
      </aside>
    );
  }

  return null;
}
