/**
 * 날짜순 일정표. 화면정의 §8.10 · §14.
 *
 * `.sr-only` 가 아니라 `<details>` 다. §8.10 은 "기본은 접힘 상태지만 키보드와
 * 스크린리더로 접근할 수 있다" 고 했다 — 눈으로 보는 키보드 사용자도 포함이다.
 * 예전 타임라인은 같은 정보를 `.sr-only` 표로만 줘서 눈이 보이는 사람은 아예
 * 닿을 수 없었다.
 *
 * (그 표에서 배운 것 하나는 남긴다: `.sr-only` 를 쓸 때 클래스는 감싸는 요소에
 * 붙인다. `<table>` 에 직접 주면 `width: 1px` 을 무시하고 내용만큼 부풀어 클릭을
 * 가로챈다 — 실측 393×530.)
 *
 * **격자에 넘긴 바로 그 배열을 받는다.** 회차를 다시 뒤져 만들면 두 경로가 조용히
 * 어긋나고, `외 N건` 으로 접힌 일정이 표에서도 빠져 "동일한 공식 일정" 이라는
 * 약속이 거짓이 된다.
 */

import type { CalendarEvent } from '../../lib/calevents.ts';
import { scheduleTable } from '../../lib/calevents.ts';
import { ExternalLink } from '../../router/Link.tsx';
import { EventDateTime } from '../EventDateTime.tsx';

interface Props {
  events: CalendarEvent[];
  today: string;
  caption: string;
  defaultOpen?: boolean;
}

export function ScheduleTable({ events, today, caption, defaultOpen }: Props) {
  const rows = scheduleTable(events, today);
  if (rows.length === 0) return null;

  return (
    <details className="fold" open={defaultOpen}>
      <summary>날짜순 일정표</summary>
      <div className="fold__body">
        <table className="sched">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <th scope="col">날짜</th>
              <th scope="col">시험</th>
              <th scope="col">구분</th>
              <th scope="col">상태</th>
              <th scope="col">공식</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.eventId} className={row.state === 'past' ? 'sched__row--past' : undefined}>
                <td className="mono">
                  <EventDateTime start={row.start} end={row.end} timing={row.timing} style="short" />
                </td>
                <td>{row.examName}</td>
                <td>{row.kindLabel}</td>
                {/* 상태는 색이 아니라 글자다 (§3.2 · §14) */}
                <td>{row.stateLabel}</td>
                <td>
                  {row.applyUrl ? (
                    <ExternalLink href={row.applyUrl} label={`${row.examName} ${row.applyLabel ?? '원서접수'} 새 창 열기`}>{row.applyLabel ?? '원서접수'}</ExternalLink>
                  ) : row.agencyUrl ? (
                    <ExternalLink href={row.agencyUrl} label={`${row.examName} 공식 시험정보 새 창 열기`}>공식 정보</ExternalLink>
                  ) : (
                    // 링크가 없는 것을 접수 마감으로 오해하게 만들지 않는다 (§15.3).
                    // 그래서 비활성 버튼이 아니라 빈 칸이다.
                    <span className="sr-only">공식 링크 없음</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
