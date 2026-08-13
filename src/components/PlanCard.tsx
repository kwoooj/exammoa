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

      {exam.rolling ? (
        <p className="small muted" style={{ marginTop: 8 }}>
          상시시험이라 확정 일정이 없어요. {exam.rollingRule ?? group?.rollingRule ?? ''}
        </p>
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
