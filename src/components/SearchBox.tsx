/**
 * 통합 검색. 화면정의 §2.2.
 *
 * 순위는 `lib/search.ts` 가 정한다. 여기서 다시 짜면 헤더 자동완성과 탐색 결과가
 * 서로 다른 시험을 내놓고, 사용자는 같은 검색을 두 번 하게 된다.
 *
 * 자동완성 항목에 **시험명 · 기관명 · 현재 상태**를 함께 적는다 (§2.2). 이름만
 * 늘어놓으면 '정보처리기사' 와 '정보처리산업기사' 중 어느 것이 지금 접수 중인지
 * 목록을 떠나 봐야 알 수 있다.
 *
 * `role="combobox"` 를 선언하지 않는다. 그 역할을 제대로 하려면 `aria-activedescendant`
 * 와 화살표 키 이동을 정확히 구현해야 하는데, 반만 하면 스크린리더가 없는 조작을
 * 안내하게 된다 — 아무 역할도 안 주는 것보다 나쁘다. 대신 결과를 평범한 링크 목록으로
 * 두어 Tab 으로 닿게 한다.
 */

import { useId, useMemo, useState } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import type { AppData } from '../data/index.ts';
import { sessionsOf } from '../data/index.ts';
import { statusOfExam } from '../lib/status.ts';
import { MIN_QUERY, searchExams } from '../lib/search.ts';
import { examPath } from '../lib/routes.ts';
import { toExamsSearch } from '../lib/query.ts';
import { EMPTY_EXAMS_QUERY } from '../lib/query.ts';
import { Link } from '../router/Link.tsx';
import { useNavigate } from '../router/Router.tsx';

interface Props {
  data: AppData;
  today: string;
  /** 홈 히어로는 크게, 헤더는 작게 */
  variant?: 'hero' | 'header';
  placeholder?: string;
}

const SUGGEST_LIMIT = 6;

export function SearchBox({ data, today, variant = 'header', placeholder }: Props) {
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const listId = useId();

  const hits = useMemo(
    () => searchExams(data.search, value, SUGGEST_LIMIT),
    [data.search, value],
  );

  const show = open && value.trim().length >= MIN_QUERY;

  function goToResults() {
    navigate(`/exams${toExamsSearch({ ...EMPTY_EXAMS_QUERY, q: value.trim() })}`);
    setOpen(false);
  }

  return (
    <div className={variant === 'hero' ? 'sbox sbox--hero' : 'sbox'}>
      <form
        role="search"
        onSubmit={e => { e.preventDefault(); goToResults(); }}
      >
        <input
          type="search"
          className="search"
          value={value}
          onChange={e => { setValue(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          // blur 를 곧바로 닫으면 목록 항목을 누르기 전에 사라진다
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder ?? '시험명 또는 시행기관 검색'}
          aria-label="시험명 또는 시행기관 검색"
          aria-describedby={show ? listId : undefined}
        />
        <button type="submit" className="sbox__submit" aria-label="검색">
          <MagnifyingGlass size={22} aria-hidden="true" />
        </button>
      </form>

      {show && (
        <div className="sbox__pop" id={listId}>
          {hits.length === 0 ? (
            // §5.4 — 자동완성이 없어도 전체 검색으로 갈 길을 준다
            <p className="sbox__none small">
              자동완성 결과가 없어요.{' '}
              <button type="button" className="linkbtn" onMouseDown={goToResults}>
                전체 결과 보기
              </button>
            </p>
          ) : (
            <>
              <ul className="sbox__list">
                {hits.map(hit => {
                  const exam = data.examBySlug.get(hit.entry.slug);
                  if (!exam) return null;
                  const status = statusOfExam(
                    exam, data.groupById.get(exam.groupId), sessionsOf(data, exam), today,
                  );
                  return (
                    <li key={hit.entry.slug}>
                      <Link to={examPath(exam.slug)} className="sbox__item">
                        <span className="sbox__name">{exam.name}</span>
                        <span className="small muted">
                          {hit.entry.agency} · {status.label}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <button type="button" className="sbox__all" onMouseDown={goToResults}>
                전체 결과 보기
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
