import type { Exam, ExamPlan, ScheduleGroup, Session } from '../types.ts';
import { dotted } from '../lib/dates.ts';
import { examOptions, occupantsOn, planKey, sameDayMessage } from '../lib/plan.ts';

interface Props {
  exam: Exam;
  group: ScheduleGroup | undefined;
  /** 이 종목이 속한 그룹의 회차 전체 */
  groupSessions: Session[];
  /** 화면 전체 계획 — 같은 날 안내를 계산하려면 다른 종목까지 봐야 한다 */
  allPlans: ExamPlan[];
  allSessions: Session[];
  nameOf: (slug: string) => string;
  today: string;
  onSession: (examSlug: string, sessionId: string) => void;
  onDate: (key: string, date: string | undefined) => void;
  onRemove: (examSlug: string) => void;
}

/** 회차가 41개인 그룹도 있다. 고를 수 있는 만큼만 보여준다. */
const MAX_SESSION_OPTIONS = 8;

export function PlanCard({
  exam, group, groupSessions, allPlans, allSessions, nameOf, today, onSession, onDate, onRemove,
}: Props) {
  const mine = allPlans.filter(p => p.examSlug === exam.slug);
  const currentId = mine[0]?.sessionId;
  // 종목 시드가 아니라 실제 회차를 기준으로 본다 — 둘이 어긋나도 화면은 데이터를 따른다.
  const rolling = groupSessions.some(s => s.id === currentId && s.mode === 'rolling') || exam.rolling === true;

  const upcoming = groupSessions
    .filter(s => s.mode !== 'rolling' && s.status !== 'tbd')
    .filter(s => s.events.some(e => e.kind === 'exam' && e.end >= today) || s.id === currentId)
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    .slice(0, MAX_SESSION_OPTIONS);

  const session = groupSessions.find(s => s.id === currentId) ?? null;
  const options = session ? examOptions(session) : [];

  return (
    <li className="card">
      <div className="card__head">
        <div>
          <span className="card__name">{exam.name}</span>
          {group && <span className="card__agency"> · {group.agency}</span>}
        </div>
        <button type="button" className="linkbtn" onClick={() => onRemove(exam.slug)}>
          빼기
        </button>
      </div>

      {rolling ? (
        <RollingCard
          exam={exam}
          group={group}
          plan={mine[0]}
          allPlans={allPlans}
          allSessions={allSessions}
          nameOf={nameOf}
          onDate={onDate}
        />
      ) : !upcoming.length ? (
        <p className="small muted" style={{ marginTop: 8 }}>남은 회차가 없어요.</p>
      ) : (
        <>
          <div className="card__row">
            <label className="card__label" htmlFor={`sess-${exam.slug}`}>회차</label>
            <select
              id={`sess-${exam.slug}`}
              value={currentId ?? ''}
              onChange={e => onSession(exam.slug, e.target.value)}
            >
              {upcoming.map(s => (
                <option key={s.id} value={s.id}>
                  {s.seq != null ? `${s.seq}회` : '회차 미정'}
                  {s.label ? ` · ${s.label}` : ''}
                </option>
              ))}
            </select>
          </div>

          {options.map(opt => {
            const plan = mine.find(p => p.phase === opt.phase);
            if (!plan) return null;
            const key = planKey(plan);

            // 하루짜리는 고를 것이 없다
            if (!opt.isRange) {
              return (
                <div className="card__row" key={opt.phase}>
                  <span className="card__label">{opt.label}</span>
                  <span className="mono small">{dotted(opt.start)}</span>
                </div>
              );
            }

            const occ = plan.date ? occupantsOn(plan.date, allPlans, allSessions, nameOf, key) : [];
            const notice = plan.date ? sameDayMessage(plan.date, occ) : null;

            return (
              <div key={opt.phase}>
                <div className="card__row">
                  <span className="card__label">{opt.label}</span>
                  <input
                    type="date"
                    value={plan.date ?? ''}
                    min={opt.start}
                    max={opt.end}
                    onChange={e => onDate(key, e.target.value || undefined)}
                    aria-label={`${exam.name} ${opt.label} 응시일`}
                  />
                  <span className="small muted mono">
                    {dotted(opt.start)} ~ {dotted(opt.end)} 중
                  </span>
                  {plan.date && (
                    <button type="button" className="linkbtn" onClick={() => onDate(key, undefined)}>
                      지우기
                    </button>
                  )}
                </div>
                {!plan.date && (
                  <p className="small muted" style={{ margin: '0 0 0 68px' }}>
                    기간 중 응시일을 정하면 D-Day가 생겨요.
                  </p>
                )}
                {notice && (
                  <p className="notice notice--strong" style={{ margin: '8px 0 0 68px' }}>
                    {notice}
                  </p>
                )}
              </div>
            );
          })}
        </>
      )}
    </li>
  );
}

/**
 * 상시시험 규칙 카드.
 *
 * 막대를 그리지 않는다 (규칙 5). 확정 회차가 없으니 고를 것도 없다.
 *
 * 그렇다고 아무것도 못 해주는 것은 아니다. **사용자는 자기가 예약한 날을 안다.**
 * 그 날짜를 받아 D-Day 를 만든다 — 사용자의 사실이지 우리가 추측한 값이 아니다.
 *
 * 접수 마감은 계산하지 않는다. "접수는 시험일 약 3주 전까지" 를 날짜로 바꾸면
 * 규칙 4 를 어기고, 틀린 마감일 하나가 시험 하나를 통째로 날린다. 규칙 원문과
 * 기관 링크를 주고 사용자가 판단하게 둔다.
 */
function RollingCard({
  exam, group, plan, allPlans, allSessions, nameOf, onDate,
}: {
  exam: Exam;
  group: ScheduleGroup | undefined;
  plan: ExamPlan | undefined;
  allPlans: ExamPlan[];
  allSessions: Session[];
  nameOf: (slug: string) => string;
  onDate: (key: string, date: string | undefined) => void;
}) {
  const rule = exam.rollingRule ?? group?.rollingRule ?? null;
  const link = group?.applyUrl ?? group?.agencyUrl ?? null;
  if (!plan) return null;

  const key = planKey(plan);
  const occ = plan.date ? occupantsOn(plan.date, allPlans, allSessions, nameOf, key) : [];
  const notice = plan.date ? sameDayMessage(plan.date, occ) : null;

  return (
    <>
      <p className="rule" role="note">
        <span className="rule__tag">상시시험</span>
        {rule ?? '확정된 회차가 없어요.'}
      </p>

      <div className="card__row">
        <span className="card__label">응시일</span>
        <input
          type="date"
          value={plan.date ?? ''}
          onChange={e => onDate(key, e.target.value || undefined)}
          aria-label={`${exam.name} 응시일`}
        />
        {plan.date && (
          <button type="button" className="linkbtn" onClick={() => onDate(key, undefined)}>
            지우기
          </button>
        )}
      </div>

      {!plan.date && (
        <p className="small muted" style={{ margin: '0 0 0 68px' }}>
          예약한 날짜를 넣으면 D-Day가 생겨요.
        </p>
      )}
      {notice && (
        <p className="notice notice--strong" style={{ margin: '8px 0 0 68px' }}>
          {notice}
        </p>
      )}
      {link && (
        <p className="small" style={{ margin: '8px 0 0 68px' }}>
          <a href={link} target="_blank" rel="noreferrer noopener">
            {group?.agency ?? exam.agency}에서 접수하기
          </a>
        </p>
      )}
    </>
  );
}
