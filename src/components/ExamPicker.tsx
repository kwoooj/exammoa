import type { Category, Exam } from '../types.ts';

/** 최대 선택 개수. 넘으면 타임라인이 읽히지 않는다 */
export const MAX_PICK = 8;

interface Props {
  exams: Exam[];
  categories: Category[];
  /** 선택된 종목 slug */
  picked: Set<string>;
  query: string;
  onQuery: (q: string) => void;
  onToggle: (slug: string) => void;
  /** 기관명. 공단이 아닌 종목은 칩에 함께 노출한다 */
  agencyOf: (exam: Exam) => string | undefined;
}

const HRDK = '한국산업인력공단';

export function ExamPicker({ exams, categories, picked, query, onQuery, onToggle, agencyOf }: Props) {
  const q = query.trim().toLowerCase();
  const match = (e: Exam) =>
    !q || e.name.toLowerCase().includes(q) || e.slug.toLowerCase().includes(q) || (e.short ?? '').toLowerCase().includes(q);

  const visible = exams.filter(match);
  const full = picked.size >= MAX_PICK;

  return (
    <section>
      <input
        className="search"
        type="search"
        value={query}
        onChange={e => onQuery(e.target.value)}
        placeholder="시험 이름 검색 (예: 정처기)"
        aria-label="시험 이름 검색"
      />

      {visible.length === 0 && <p className="small muted">검색 결과가 없어요.</p>}

      {categories.map(cat => {
        const list = visible.filter(e => e.category === cat.id);
        if (!list.length) return null;
        return (
          <div className="cat" key={cat.id}>
            <p className="cat__name">{cat.name}</p>
            <div className="chips">
              {list.map(e => {
                const on = picked.has(e.slug);
                const agency = agencyOf(e);
                return (
                  <button
                    key={e.slug}
                    type="button"
                    className="chip"
                    aria-pressed={on}
                    // 이미 고른 것은 언제나 해제할 수 있어야 한다. 상한은 추가에만 적용한다.
                    disabled={!on && full}
                    onClick={() => onToggle(e.slug)}
                  >
                    <span>{e.short ?? e.name}</span>
                    {e.rolling && <span className="chip__tag">상시</span>}
                    {agency && agency !== HRDK && <span className="chip__tag">{agency}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {full && (
        <p className="small muted">
          최대 {MAX_PICK}개까지 고를 수 있어요. 바꾸려면 고른 것을 먼저 해제해 주세요.
        </p>
      )}
    </section>
  );
}
