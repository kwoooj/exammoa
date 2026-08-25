import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DETAIL_ADAPTERS, parseNormalizedDetailJson } from './detail-adapters.mjs';

test('정규화 업로드에 출처 참조를 중복 없이 붙인다', () => {
  const parsed = parseNormalizedDetailJson(JSON.stringify({
    details: [{ examSlug: '시험A', sourceRefs: ['다른출처'] }],
  }), { source: { id: 'official' } });
  assert.deepEqual(parsed.details[0].sourceRefs, ['다른출처', 'official']);
  assert.deepEqual(parsed.diagnostics, {
    discovered: 1, included: 1, missing: [], unclassified: [], failures: [],
  });
});

test('어댑터 레지스트리에 승인형 JSON 입력이 있다', () => {
  assert.equal(typeof DETAIL_ADAPTERS.get('normalized-detail-json')?.parse, 'function');
  assert.equal(typeof DETAIL_ADAPTERS.get('qnet-detail')?.collect, 'function');
  assert.equal(typeof DETAIL_ADAPTERS.get('qnet-detail')?.parse, 'function');
});
