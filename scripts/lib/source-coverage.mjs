// 공식 원본 전수 수집 진단.
//
// 파서가 아는 코드만 filter() 하면 새 종목이 생긴 날 조용히 버려진다. 각 어댑터는
// 원본에서 발견한 종목 식별자와 실제 포함한 식별자를 모두 남기고, 이 모듈이 미분류와
// 예정 종목 누락을 같은 규칙으로 판정한다.

const unique = values => [...new Set((values ?? []).map(value => String(value)).filter(Boolean))].sort();

/**
 * @param {{discovered?:unknown[], included?:unknown[], expected?:unknown[], labels?:Record<string,string>}} input
 */
export function sourceCoverage({ discovered = [], included = [], expected = [], labels = {} } = {}) {
  const found = unique(discovered);
  const used = unique(included);
  const wanted = unique(expected);
  const usedSet = new Set(used);
  const foundSet = new Set(found);
  return {
    discovered: found.length,
    included: used.length,
    unclassified: found.filter(id => !usedSet.has(id)).map(id => labels[id] ? `${id}:${labels[id]}` : id),
    missing: wanted.filter(id => !foundSet.has(id)),
  };
}

/** 미분류나 예정 종목 누락은 소스 실패다. null 이면 전수 분류 완료. */
export function coverageProblem(coverage) {
  if (!coverage) return null;
  const parts = [];
  if (coverage.unclassified?.length) parts.push(`미분류 ${coverage.unclassified.join(', ')}`);
  if (coverage.missing?.length) parts.push(`원본에서 누락 ${coverage.missing.join(', ')}`);
  return parts.length ? parts.join(' · ') : null;
}

export function coverageLine(coverage) {
  if (!coverage) return null;
  return `원본 ${coverage.discovered ?? 0}종 · 포함 ${coverage.included ?? 0}종 · 미분류 ${coverage.unclassified?.length ?? 0}종`;
}
