import { useEffect, useRef, useState } from 'react';
import type { ExamPlan, PlanKey, Session } from '../types.ts';
import { dotted } from '../lib/dates.ts';
import { occupantsOn, sameDayMessage } from '../lib/plan.ts';
import { WEEKDAYS, monthGrid, monthLabel, shiftMonth, ym } from '../lib/calendar.ts';
import { WarnIcon } from './icons.tsx';

/** 시트가 열릴 대상. 계획 하나의 한 단계(필기·실기·단일)를 가리킨다 */
export interface PickTarget {
  key: PlanKey;
  examName: string;
  /** 이벤트명. `필기시험` */
  label: string;
  /** 고를 수 있는 기간. 상시시험은 null — 확정 회차가 없다 */
  range: { start: string; end: string } | null;
  /** 지금 지정된 응시일 */
  date?: string;
  /** 상시시험 규칙 원문. 우리가 날짜로 바꾸지 않고 그대로 보여준다 */
  rule?: string | null;
}

interface Props {
  target: PickTarget | null;
  /** 같은 날 안내를 계산하려면 화면 전체 계획을 봐야 한다 */
  plans: ExamPlan[];
  sessions: Session[];
  nameOf: (slug: string) => string;
  today: string;
  onSubmit: (key: PlanKey, date: string | undefined) => void;
  onClose: () => void;
}

/**
 * 응시일 지정 시트.
 *
 * `<dialog>` 를 쓴다. 포커스 가두기·Esc 닫기·백드롭을 브라우저가 주므로 라이브러리가
 * 필요 없고, 손으로 만든 포커스 트랩보다 정확하다.
 *
 * 기간 밖 날짜는 누를 수 없게 하되, **같은 날 중복은 막지 않는다.** 하루에 두 시험을
 * 보는 것은 사용자의 선택이고 실제로 가능하다. 우리가 할 일은 알려주는 것까지다.
 */
export function DatePickSheet({ target, plans, sessions, nameOf, today, onSubmit, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [month, setMonth] = useState(() => ym(today));

  // 대상이 바뀔 때마다 선택과 보고 있는 달을 다시 맞춘다
  useEffect(() => {
    if (!target) return;
    const initial = target.date ?? null;
    setPicked(initial);
    setMonth(ym(initial ?? target.range?.start ?? today));
  }, [target, today]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (target && !el.open) el.showModal();
    if (!target && el.open) el.close();
  }, [target]);

  if (!target) return <dialog className="sheet" ref={ref} />;

  /**
   * 닫기는 상태로만 한다.
   *
   * `<dialog>` 의 close 이벤트로 상태를 지우면 안 된다 — 크롬은 close 를 **비동기로**
   * 큐에 넣기 때문에, 시트 A 를 닫고 곧바로 B 를 열면 뒤늦게 도착한 A 의 close 가
   * 방금 연 B 를 지운다 (실측). 닫는 경로를 우리가 아는 곳(취소·저장·백드롭·Esc)으로
   * 한정하고, 실제 dialog 를 닫는 것은 위의 이펙트에 맡긴다.
   */
  const dismiss = () => onClose();

  const { range } = target;
  const cells = monthGrid(month).flat();
  const occupants = picked ? occupantsOn(picked, plans, sessions, nameOf, target.key) : [];
  const clash = picked ? sameDayMessage(picked, occupants) : null;

  // 기간이 있으면 그 밖으로는 넘어갈 이유가 없다. 상시시험은 제한하지 않는다.
  const minMonth = range ? ym(range.start) : null;
  const maxMonth = range ? ym(range.end) : null;

  return (
    <dialog
      className="sheet"
      ref={ref}
      aria-labelledby="sheet-title"
      onCancel={dismiss}
      onClick={e => {
        // 백드롭(다이얼로그 바깥)을 누르면 닫는다
        if (e.target === ref.current) dismiss();
      }}
    >
      <div className="sheet__body">
        <h2 className="sheet__title" id="sheet-title">
          {target.examName} {target.label}
        </h2>
        <p className="sheet__sub">
          {range
            ? `${dotted(range.start)} ~ ${dotted(range.end)} 중 하루`
            : '상시시험이라 확정 일정이 없어요. 예약한 날짜를 넣어 주세요'}
        </p>

        {/* 부제가 이미 '상시시험' 이라고 말했다. 여기서 태그를 또 달면 같은 말이 두 번 나온다 */}
        {!range && target.rule && <p className="rule">{target.rule}</p>}

        <div className="mcal">
          <div className="mcal__nav">
            <button
              type="button"
              className="cal__navBtn"
              aria-label="이전 달"
              disabled={!!minMonth && month <= minMonth}
              onClick={() => setMonth(shiftMonth(month, -1))}
            >
              ‹
            </button>
            <span className="mcal__title" aria-live="polite">{monthLabel(month)}</span>
            <button
              type="button"
              className="cal__navBtn"
              aria-label="다음 달"
              disabled={!!maxMonth && month >= maxMonth}
              onClick={() => setMonth(shiftMonth(month, 1))}
            >
              ›
            </button>
          </div>

          <div className="mcal__grid">
            {WEEKDAYS.map(wd => (
              <span key={wd} className="mcal__wd">{wd}</span>
            ))}
            {cells.map(cell => {
              const out = range ? cell.date < range.start || cell.date > range.end : false;
              const on = cell.date === picked;
              return (
                <button
                  key={cell.date}
                  type="button"
                  className={[
                    'mcal__day',
                    cell.inMonth ? '' : 'mcal__day--out',
                    cell.date === today ? 'mcal__day--today' : '',
                    on ? 'mcal__day--on' : '',
                  ].filter(Boolean).join(' ')}
                  disabled={out}
                  aria-pressed={on}
                  aria-label={dotted(cell.date)}
                  onClick={() => setPicked(cell.date)}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </div>

        {clash && (
          <p className="notice" role="status">
            <WarnIcon />
            <span>{clash}</span>
          </p>
        )}
      </div>

      <div className="sheet__foot">
        {target.date && (
          <button
            type="button"
            className="linkbtn"
            onClick={() => {
              onSubmit(target.key, undefined);
              dismiss();
            }}
          >
            지우기
          </button>
        )}
        <span className="sheet__spacer" />
        <button type="button" className="btn btn--ghost" onClick={dismiss}>
          취소
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={!picked}
          onClick={() => {
            if (picked) onSubmit(target.key, picked);
            dismiss();
          }}
        >
          이 날 볼 예정
        </button>
      </div>
    </dialog>
  );
}
