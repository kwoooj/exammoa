/**
 * 공용 시험 목록 항목. 화면정의 §4.
 *
 * S-01 의 "지금 접수할 수 있는 시험", S-02 의 결과, 어디든 목록이 필요한 곳이
 * 같은 것을 쓴다. 세 곳이 각자 그리면 같은 시험이 화면마다 다른 상태로 보인다.
 *
 * §4.3 에서 금지한 것들을 지킨다:
 *   - D-Day 숫자만 크게 보여주지 않는다 (상태 배지에 대상이 함께 들어간다)
 *   - 모든 회차를 한 항목에 펼치지 않는다 (가장 가까운 접수·시험 한 줄씩)
 *   - 공식 일정을 보기 전에 계획 날짜 입력을 요구하지 않는다
 *   - 기관명·날짜보다 장식을 앞세우지 않는다
 */

import type { ExamRow as Row } from '../lib/browse.ts';
import { rangeLabel } from '../lib/dates.ts';
import { examPath } from '../lib/routes.ts';
import { Link, OfficialLinkButton } from '../router/Link.tsx';

interface Props {
  row: Row;
  /** 캘린더에 담기 (§6.6). 없으면 체크박스를 그리지 않는다 */
  picked?: boolean;
  onPick?: (slug: string, next: boolean) => void;
  pickDisabled?: boolean;
}

function EventLine({ label, event }: { label: string; event: Row['nextReg'] }) {
  if (!event) return null;
  return (
    <p className="exrow__when">
      <span className="exrow__what">{event.label || label}</span>
      <time dateTime={event.start}>{rangeLabel(event.start, event.end, 'short')}</time>
    </p>
  );
}

export function ExamRow({ row, picked, onPick, pickDisabled }: Props) {
  const { exam, status } = row;

  return (
    <li className="exrow">
      {onPick && (
        <input
          type="checkbox"
          className="exrow__pick"
          checked={picked ?? false}
          // 상한에 걸렸을 때 이미 고른 것은 풀 수 있어야 한다
          disabled={pickDisabled && !picked}
          onChange={e => onPick(exam.slug, e.target.checked)}
          aria-label={`${exam.name} 캘린더에 담기`}
        />
      )}

      <div className="exrow__body">
        <p className="exrow__head">
          {/* 상태가 먼저다. 지금 접수할 수 있는지가 §0 의 두 번째 질문이다 */}
          <span className={status.emphasis ? 'badge badge--accent' : 'badge'} aria-label={status.a11yLabel}>
            {status.label}
          </span>
          {row.freshness.overdue && (
            <span className="badge badge--warn" title="공식 사이트에서 다시 확인해 주세요">
              {row.freshness.label}
            </span>
          )}
        </p>

        <p className="exrow__name">
          <Link to={examPath(exam.slug)}>{exam.name}</Link>
          <span className="exrow__agency">{row.agency}</span>
        </p>

        <EventLine label="원서접수" event={row.nextReg} />
        <EventLine label="시험" event={row.nextExam} />

        {status.id === 'rolling' && (
          <p className="exrow__when"><span className="exrow__what">상시시험</span>확정 회차 없음</p>
        )}
        {status.id === 'tbd' && (
          <p className="exrow__when"><span className="exrow__what">일정</span>아직 발표되지 않았어요</p>
        )}
      </div>

      <div className="exrow__go">
        <Link to={examPath(exam.slug)} className="btn">상세 일정</Link>
        <OfficialLinkButton link={row.link} className="btn btn--primary" />
      </div>
    </li>
  );
}
