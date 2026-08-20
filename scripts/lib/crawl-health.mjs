import { coverageProblem } from './source-coverage.mjs';

/**
 * 크롤 결과를 게시 가능한 상태인지 한 곳에서 판정한다.
 *
 * 일부 행만 파싱하지 못한 결과도 성공으로 게시하면 해당 회차가 조용히 사라진다.
 * 따라서 구조·시간·전수 분류뿐 아니라 행 단위 실패도 소스 전체 실패로 처리해
 * store.mergeStale()가 직전 성공 데이터를 계승하게 한다.
 */
export function crawlDiagnosticProblem(diagnostics = {}) {
  if (!diagnostics.headerMatch) {
    return '기대한 일정 구조를 찾지 못했다 (사이트 개편 가능)';
  }
  if (diagnostics.timingMatch === false) {
    return '공식 시험시간 표를 찾지 못했거나 기존 시간과 달라졌다 (사이트 개편 가능)';
  }
  const scopeProblem = coverageProblem(diagnostics.coverage);
  if (scopeProblem) {
    return `공식 원본 전수 분류 실패 — ${scopeProblem}`;
  }
  const failures = diagnostics.failures ?? [];
  if (failures.length) {
    const first = failures[0];
    const where = [first.seq ? `${first.seq}회` : null, first.label].filter(Boolean).join(' ');
    return `일정 파싱 실패 ${failures.length}건${where ? ` — ${where}` : ''} (${first.reason ?? '원인 미상'})`;
  }
  return null;
}
