/**
 * S-02 시험 일정 탐색. 화면정의 §6.
 *
 * 검색·필터·정렬 상태는 전부 URL 에 남는다 (§6.2). 새로고침·뒤로 가기·링크 공유
 * 뒤에도 결과가 같아야 하고, 그 계약의 정본은 `lib/query.ts` 다.
 *
 * 별표로 저장한 시험은 관심 시험 캘린더에서 한눈에 볼 수 있다.
 */

import { useMemo } from 'react';
import type { AppData } from '../data/index.ts';
import type { StatusFilter } from '../lib/status.ts';
import type { Cadence } from '../types.ts';
import { CADENCE_LABEL } from '../lib/status.ts';
import { buildRows, filterRows, sortRows } from '../lib/browse.ts';
import { DEFAULT_SORT, activeFilterCount, parseExamsQuery, toExamsSearch } from '../lib/query.ts';
import type { ExamsQuery, SortKey } from '../lib/query.ts';
import { useLocation, useNavigate } from '../router/Router.tsx';
import { ExamRow } from '../components/ExamRow.tsx';
import { SearchBox } from '../components/SearchBox.tsx';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'open', label: '접수 중' },
  { value: 'upcoming', label: '접수 예정' },
  { value: 'exam-upcoming', label: '시험 예정' },
  { value: 'rolling', label: '상시시험' },
  { value: 'tbd', label: '일정 미공고' },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'deadline', label: '마감 가까운 순' },
  { value: 'exam', label: '시험 가까운 순' },
  { value: 'name', label: '시험명 순' },
];

export function Exams({ data, today }: { data: AppData; today: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const query = parseExamsQuery(location.search, {
    categoryIds: data.categories.map(c => c.id),
    agencies: data.agencies,
  });

  const update = (next: Partial<ExamsQuery>) => {
    navigate(`/exams${toExamsSearch({ ...query, ...next })}`, { replace: true, scroll: false });
  };

  const rows = useMemo(() => buildRows({ ...data, today }), [data, today]);
  const found = useMemo(() => filterRows(rows, query, data.search), [rows, query, data.search]);
  const sorted = useMemo(
    () => sortRows(found, query.sort, query.q !== ''),
    [found, query.sort, query.q],
  );

  const filterCount = activeFilterCount(query);
  return (
    <>
      <section className="section section--lead">
        <h1>시험 일정 찾기</h1>
        <SearchBox data={data} today={today} />
        <p className="small muted favoritesHint">별표로 저장한 시험은 관심 시험 캘린더에서 한눈에 볼 수 있어요.</p>

        <div className="filters">
          <label className="filters__field">
            분야
            <select value={query.category ?? ''} onChange={e => update({ category: e.target.value || null })}>
              <option value="">전체</option>
              {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>

          <label className="filters__field">
            상태
            <select
              value={query.status ?? ''}
              onChange={e => update({ status: (e.target.value || null) as StatusFilter | null })}
            >
              <option value="">전체</option>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>

          <label className="filters__field">
            유형
            <select
              value={query.cadence ?? ''}
              onChange={e => update({ cadence: (e.target.value || null) as Cadence | null })}
            >
              <option value="">전체</option>
              {(Object.keys(CADENCE_LABEL) as Cadence[]).map(c => (
                <option key={c} value={c}>{CADENCE_LABEL[c]}</option>
              ))}
            </select>
          </label>

          <label className="filters__field">
            기관
            <select value={query.agency ?? ''} onChange={e => update({ agency: e.target.value || null })}>
              <option value="">전체</option>
              {data.agencies.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>

          {filterCount > 0 && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => navigate('/exams', { replace: true, scroll: false })}
            >
              필터 초기화
            </button>
          )}
        </div>

        <div className="section__head">
          <p className="results" role="status">
            {query.q ? `‘${query.q}’ 검색 결과 ` : ''}
            <strong>{sorted.length}개</strong>
            {filterCount > 0 ? ` · 필터 ${filterCount}개` : ''}
          </p>
          <label className="filters__field">
            정렬
            <select value={query.sort} onChange={e => update({ sort: e.target.value as SortKey })}>
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="section">
        {sorted.length === 0 ? (
          // §6.7 — 이유와 다음 행동을 함께 준다
          <div className="empty">
            <p>조건에 맞는 시험을 찾지 못했어요.</p>
            <p className="small muted">
              {query.q ? '검색어의 일부만 넣거나 ' : ''}
              상태 또는 기간 필터를 줄여 보세요.
            </p>
            {(filterCount > 0 || query.sort !== DEFAULT_SORT) && (
              <p className="row">
                <button type="button" className="btn btn--primary" onClick={() => navigate('/exams', { replace: true, scroll: false })}>
                  필터 초기화
                </button>
              </p>
            )}
          </div>
        ) : (
          <ul className="exrows">
            {sorted.map(row => <ExamRow key={row.exam.slug} row={row} />)}
          </ul>
        )}
      </section>
    </>
  );
}
