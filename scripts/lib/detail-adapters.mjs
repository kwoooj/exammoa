import { collectQnetDetails, parseQnetDetailBundle } from '../sources/qnet-detail.mjs';
import { parseKaitLinuxDetail } from '../sources/kait-linux-detail.mjs';

/**
 * 승인형 업로드의 공통 입력 형식.
 *
 * PDF·HTML·JSON 원문 파서는 출처별 어댑터가 이 인터페이스를 구현한다. 사람이 이미
 * 공식 문서를 대조해 정규화한 JSON도 같은 후보·검증·승격 경로를 타게 해, 수기 입력이
 * 자동 수집보다 느슨해지는 구멍을 막는다.
 */
export function parseNormalizedDetailJson(raw, { source }) {
  const document = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const details = Array.isArray(document) ? document : document?.details;
  if (!Array.isArray(details)) throw new Error('정규화 업로드에 details 배열이 없다.');
  const normalized = details.map(detail => ({
    ...detail,
    sourceRefs: [...new Set([...(detail.sourceRefs ?? []), source.id])],
  }));
  return {
    details: normalized,
    diagnostics: {
      discovered: normalized.length,
      included: normalized.length,
      missing: [],
      unclassified: [],
      failures: [],
    },
  };
}

export const DETAIL_ADAPTERS = new Map([
  ['normalized-detail-json', { parse: parseNormalizedDetailJson, extension: 'json' }],
  ['qnet-detail', { collect: collectQnetDetails, parse: parseQnetDetailBundle, extension: 'json' }],
  ['kait-linux-detail', { parse: parseKaitLinuxDetail, extension: 'html' }],
]);
