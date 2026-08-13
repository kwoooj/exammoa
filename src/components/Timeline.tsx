import type { ExamPlan, ScheduleGroup, Session } from '../types.ts';
import { buildRows, monthTicks, timelineWindow, todayLeft } from '../lib/timeline.ts';
import { dotted } from '../lib/dates.ts';

interface Props {
  plans: ExamPlan[];
  sessions: Session[];
  groups: ScheduleGroup[];
  nameOf: (slug: string) => string;
  today: string;
}

const pct = (n: number) => `${(n * 100).toFixed(3)}%`;

/**
 * 가로 타임라인. 달력과 역할이 다르다 — 달력은 '이 날짜에 뭐가 있나', 여기는
 * '6개월 중 어디가 몰려 있나'.
 *
 * 모바일에서 가로 스크롤을 쓰지 않는다. 6개월을 화면 폭에 맞춘다. 스크롤로 나눠 보면
 * "10월에 뭐가 몰려 있나" 를 한 번에 볼 수 없고 그러면 이 화면의 존재 이유가 없어진다.
 */
export function Timeline({ plans, sessions, groups, nameOf, today }: Props) {
  const w = timelineWindow(today);
  const rows = buildRows(plans, sessions, groups, nameOf, w);
  if (!rows.length) {
    return <p className="empty">시험을 고르면 6개월 일정이 여기 그려져요.</p>;
  }

  const ticks = monthTicks(w);
  const nowLeft = todayLeft(today, w);

  return (
    <div className="tl">
      <div className="tl__axis">
        <div className="tl__label" />
        <div className="tl__track tl__track--axis">
          {ticks.map(t => (
            <span key={t.month} className="tl__tick" style={{ left: pct(Math.max(t.left, 0)) }}>
              {t.label}
            </span>
          ))}
        </div>
      </div>

      {rows.map(row => (
        <div className="tl__row" key={row.groupId}>
          <div className="tl__label">
            <span className="tl__name" title={row.examSlugs.join(', ')}>{row.label}</span>
            {row.agency && <span className="tl__agency">{row.agency}</span>}
          </div>
          <div className="tl__track">
            {ticks.map(t =>
              t.left > 0 ? (
                <span key={`g-${t.month}`} className="tl__gridline" style={{ left: pct(t.left) }} />
              ) : null,
            )}
            <span className="tl__now" style={{ left: pct(nowLeft) }} />

            {row.dense ? (
              <span className="tl__band">
                6개월 중 {row.sessionCount}회 시행 · 회차를 골라 응시일을 정하세요
              </span>
            ) : (
              row.bars.map(b => (
                <span
                  key={b.key}
                  className={[
                    'tl__bar',
                    `tl__bar--${b.kind}`,
                    b.isPoint ? 'tl__bar--point' : '',
                    b.past ? 'tl__bar--past' : '',
                    b.superseded ? 'tl__bar--superseded' : '',
                  ].filter(Boolean).join(' ')}
                  style={{ left: pct(b.left), width: b.isPoint ? undefined : pct(b.width) }}
                  title={b.label}
                />
              ))
            )}

            {row.markers.map(m => (
              <span key={m.key} className="tl__marker" style={{ left: pct(m.left) }} title={m.label} />
            ))}
          </div>
        </div>
      ))}

      <p className="tl__legend small muted">
        <span className="tl__bar tl__bar--reg tl__bar--sample" /> 접수
        <span className="tl__bar tl__bar--exam tl__bar--sample" /> 시험
        <span className="tl__bar tl__bar--result tl__bar--point tl__bar--sample" /> 발표
        <span className="tl__marker tl__marker--sample" /> 응시 예정
        <span className="tl__nowKey">|</span> 오늘 ({dotted(today)})
      </p>
    </div>
  );
}
