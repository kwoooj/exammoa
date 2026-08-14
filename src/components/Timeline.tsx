import { Fragment } from 'react';
import type { EventPhase, ExamPlan, ScheduleGroup, Session } from '../types.ts';
import { type Row, buildRows, monthTicks, timelineWindow, todayLeft } from '../lib/timeline.ts';
import { dotted } from '../lib/dates.ts';

interface Props {
  plans: ExamPlan[];
  sessions: Session[];
  groups: ScheduleGroup[];
  nameOf: (slug: string) => string;
  today: string;
  /** 기간 시행 시험 막대를 누르면 응시일 시트를 연다 */
  onPickBar?: (groupId: string, sessionId: string, phase: EventPhase) => void;
}

const pct = (n: number) => `${(n * 100).toFixed(3)}%`;

const KIND_LABEL = { reg: '원서접수', exam: '시험', result: '발표' } as const;

/**
 * 가로 타임라인. 달력과 역할이 다르다 — 달력은 '이 날짜에 뭐가 있나', 여기는
 * '6개월 중 어디가 몰려 있나'.
 *
 * 모바일에서 가로 스크롤을 쓰지 않는다. 6개월을 화면 폭에 맞춘다. 스크롤로 나눠 보면
 * "10월에 뭐가 몰려 있나" 를 한 번에 볼 수 없고 그러면 이 화면의 존재 이유가 없어진다.
 */
export function Timeline({ plans, sessions, groups, nameOf, today, onPickBar }: Props) {
  const w = timelineWindow(today);
  const rows = buildRows(plans, sessions, groups, nameOf, w);
  if (!rows.length) {
    return <p className="empty">시험을 고르면 6개월 일정이 여기 그려져요.</p>;
  }

  const ticks = monthTicks(w);
  const nowLeft = todayLeft(today, w);

  /**
   * 창이 오늘부터 시작하므로 오늘 선은 거의 항상 왼쪽 끝이고, 거기에는 첫 월 라벨이
   * 이미 서 있다. 둘을 겹쳐 찍으면 '오늘8월' 로 읽힌다 (실측). 겹치는 월 라벨은
   * `오늘` 로 바꿔 달고, 겹칠 라벨이 없을 때만 따로 하나 세운다.
   */
  const nowTick = ticks.find(t => Math.abs(Math.max(t.left, 0) - nowLeft) < 0.05);

  return (
    <div className="tl">
      <div className="tl__axis" aria-hidden="true">
        <div className="tl__label" />
        <div className="tl__track tl__track--axis">
          {ticks.map(t => (
            <span
              key={t.month}
              className={`tl__tick ${t === nowTick ? 'tl__tick--now' : ''}`}
              style={{ left: pct(Math.max(t.left, 0)) }}
            >
              {t === nowTick ? '오늘' : t.label}
            </span>
          ))}
          {!nowTick && <span className="tl__nowLabel" style={{ left: pct(nowLeft) }}>오늘</span>}
        </div>
      </div>

      {/* 행에는 aria-hidden 을 걸지 않는다. 안에 초점을 받는 버튼이 있으면
          aria-hidden 서브트리에 갇혀 키보드로 닿는데 읽히지는 않는 요소가 된다. */}
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
              <span className="tl__band">6개월 중 {row.sessionCount}회 시행 · 회차를 골라주세요</span>
            ) : (
              row.bars.map(b => {
                const classes = [
                  'tl__bar',
                  `tl__bar--${b.kind}`,
                  b.isPoint ? 'tl__bar--point' : '',
                  b.past ? 'tl__bar--past' : '',
                  b.superseded ? 'tl__bar--superseded' : '',
                ].filter(Boolean).join(' ');
                const style = { left: pct(b.left), width: b.isPoint ? undefined : pct(b.width) };

                /**
                 * 기간 시행 시험만 누를 수 있다. 접수·발표는 우리가 정하는 것이 아니고,
                 * 하루짜리 시험은 고를 날이 하루뿐이라 시트를 열 이유가 없다.
                 */
                const pickable = onPickBar && b.kind === 'exam' && !b.isPoint && b.start !== b.end;
                if (!pickable) {
                  return <span key={b.key} className={classes} style={style} title={b.label} />;
                }

                return (
                  <button
                    key={b.key}
                    type="button"
                    className={`${classes} tl__bar--pick`}
                    style={style}
                    title={`${b.label} — 응시일 정하기`}
                    aria-label={`${row.label} ${b.label} 응시일 정하기`}
                    onClick={() => onPickBar(row.groupId, b.sessionId, b.phase)}
                  />
                );
              })
            )}

            {row.otherCount > 0 && !row.dense && (
              <span className="tl__other">다른 회차 {row.otherCount}개</span>
            )}

            {row.markers.map(m => (
              <span key={m.key} className="tl__marker" style={{ left: pct(m.left) }} title={m.label} />
            ))}
          </div>
        </div>
      ))}

      <p className="tl__legend small muted" aria-hidden="true">
        <span className="tl__bar tl__bar--reg tl__bar--sample" /> 접수
        <span className="tl__bar tl__bar--exam tl__bar--sample" /> 시험
        <span className="tl__bar tl__bar--result tl__bar--point tl__bar--sample" /> 발표
        <span className="tl__marker tl__marker--sample" /> 응시 예정
        <span className="tl__nowKey">|</span> 오늘 ({dotted(today)})
      </p>

      <TimelineTable rows={rows} today={today} />
    </div>
  );
}

/**
 * 막대를 표로도 읽을 수 있게 한다 (NFR-A11Y-02).
 *
 * 막대는 위치와 길이로만 뜻을 전한다. `title` 속성은 스크린리더가 읽어 주기도 하고
 * 아니기도 해서 대체 표현이 될 수 없다. 그래서 같은 `rows` 로 표를 한 벌 더 그리고
 * 화면에서만 감춘다 — 데이터가 갈라지지 않도록 계산은 공유한다.
 */
function TimelineTable({ rows, today }: { rows: Row[]; today: string }) {
  return (
    <table className="sr-only">
      <caption>오늘({dotted(today)})부터 6개월간의 일정</caption>
      <thead>
        <tr>
          <th scope="col">시행그룹</th>
          <th scope="col">이벤트</th>
          <th scope="col">기간</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row =>
          row.dense ? (
            <tr key={row.groupId}>
              <th scope="row">{row.label}</th>
              <td>6개월 중 {row.sessionCount}회 시행</td>
              <td>회차를 고르면 일정이 나옵니다</td>
            </tr>
          ) : (
            <Fragment key={row.groupId}>
              {row.bars.map(b => (
                <tr key={b.key}>
                  <th scope="row">{row.label}</th>
                  <td>{b.label || KIND_LABEL[b.kind]}</td>
                  <td>{b.start === b.end ? dotted(b.start) : `${dotted(b.start)} ~ ${dotted(b.end)}`}</td>
                </tr>
              ))}
              {row.markers.map(m => (
                <tr key={m.key}>
                  <th scope="row">{row.label}</th>
                  <td>응시 예정</td>
                  <td>{m.label}</td>
                </tr>
              ))}
            </Fragment>
          ),
        )}
      </tbody>
    </table>
  );
}
