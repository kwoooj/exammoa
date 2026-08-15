/**
 * 선택한 시험 칩과 시험 추가. 화면정의 §8.3 · §8.4.
 *
 * 칩은 **접히지 않는다.** 달력에서는 같은 시행그룹이 한 막대로 접히기 때문에
 * (§8.8), 여기까지 접으면 사용자가 고른 것을 확인할 데가 한 곳도 없어진다.
 * 색 견본을 함께 두어 어느 막대가 어느 시험인지 눈으로 잇는다.
 */

import { useMemo, useState } from 'react';
import type { AppData } from '../../data/index.ts';
import { agencyOf } from '../../data/index.ts';
import type { ColorIndex } from '../../lib/calcolors.ts';
import { swatchClass } from '../../lib/calcolors.ts';
import { MAX_CALENDAR_EXAMS } from '../../lib/query.ts';
import { MIN_QUERY, searchExams } from '../../lib/search.ts';

interface Props {
  data: AppData;
  selected: string[];
  /** 그룹 → 색. 칩 견본이 막대와 같은 색이어야 한다 */
  colorOf: ReadonlyMap<string, ColorIndex>;
  onChange: (slugs: string[]) => void;
}

export function ExamChips({ data, selected, colorOf, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const full = selected.length >= MAX_CALENDAR_EXAMS;

  const hits = useMemo(
    () => searchExams(data.search, query, 20).filter(h => !selected.includes(h.entry.slug)),
    [data.search, query, selected],
  );

  return (
    <div className="picked">
      {selected.length > 0 && (
        <ul className="picked__chips">
          {selected.map(slug => {
            const exam = data.examBySlug.get(slug);
            const color = colorOf.get(exam?.groupId ?? '') ?? null;
            return (
              <li key={slug}>
                <span className="chip chip--picked">
                  <span className={swatchClass(color)} aria-hidden="true" />
                  {exam?.name ?? slug}
                  <button
                    type="button"
                    className="chip__x"
                    onClick={() => onChange(selected.filter(s => s !== slug))}
                    aria-label={`${exam?.name ?? slug} 빼기`}
                  >
                    ×
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <details
        className="picker"
        open={open}
        onToggle={e => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="btn">시험 추가</summary>
        <div className="picker__body">
          {/* 상한을 넘겼다고 입력을 막지 않는다. 무엇을 빼야 하는지 먼저 말한다 */}
          {full && (
            <p className="small muted">
              최대 {MAX_CALENDAR_EXAMS}개까지 함께 볼 수 있어요. 하나를 빼면 더 담을 수 있어요.
            </p>
          )}
          <input
            type="search"
            className="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="시험명 또는 시행기관 검색"
            aria-label="시험 검색"
          />
          {query.trim().length >= MIN_QUERY && (
            hits.length === 0 ? (
              <p className="small muted">조건에 맞는 시험을 찾지 못했어요.</p>
            ) : (
              <ul className="picker__list">
                {hits.map(hit => {
                  const exam = data.examBySlug.get(hit.entry.slug);
                  return (
                    <li key={hit.entry.slug}>
                      <button
                        type="button"
                        className="picker__item"
                        disabled={full}
                        onClick={() => {
                          onChange([...selected, hit.entry.slug]);
                          setQuery('');
                          setOpen(false);
                        }}
                      >
                        <span>{hit.entry.name}</span>
                        <span className="small muted">{exam ? agencyOf(data, exam) : hit.entry.agency}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
          )}
        </div>
      </details>
    </div>
  );
}
