import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchDetailRaw, prepareDetailProposal, sourceUrlOf } from './detail-collector.mjs';
import { detailContentHash } from './detail-proposal.mjs';

const source = {
  id: 'official', method: 'manual-upload', adapter: 'normalized-detail-json', examSlugs: ['시험A'],
  robots: { status: 'not-applicable' },
};
const detail = {
  examSlug: '시험A', catalogStatus: 'published', sourceRefs: ['official'],
  classification: { label: '공인', authority: '기관', sourceUrl: 'https://example.com', checkedAt: '2026-08-24' },
  result: { label: '합격제' }, deliveryModes: ['시험장'],
  formats: [{ effectiveFrom: '2026-01-01', checkedAt: '2026-08-24', sourceUrl: 'https://example.com', stages: [{ id: 'one', name: '시험', sections: [{ name: '전체' }] }] }],
};

test('URL template은 시험 코드로만 치환한다', () => {
  assert.equal(sourceUrlOf({ urlTemplate: 'https://example.com/{jmCd}' }, { slug: '시험', jmCd: '13 20' }), 'https://example.com/13%2020');
  assert.throws(() => sourceUrlOf({ urlTemplate: 'https://example.com/{jmCd}' }, { slug: '시험' }), /치환값/);
});

test('승인형 입력도 후보 검증과 의미 변경 판정을 거친다', () => {
  const raw = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
  const parseInput = JSON.stringify({ details: [detail] });
  const prepared = prepareDetailProposal({
    source, raw, parseInput, archivePath: `data/archive/details/2026/official.20260824T000000Z.${detailContentHash(raw).slice(0, 12)}.pdf`,
    observedAt: '2026-08-24T00:00:00Z', currentDetails: [], knownExamSlugs: ['시험A'],
  });
  assert.equal(prepared.proposal.details[0].sourceRefs[0], 'official');
  assert.equal(prepared.changes.length, 1);
});

test('자동 수집은 robots 허용이 없으면 요청하지 않는다', async () => {
  let called = false;
  await assert.rejects(
    fetchDetailRaw({ id: 'blocked', sourceUrl: 'https://example.com', method: 'html', robots: { status: 'blocked' } }, async () => {
      called = true;
      return { ok: true, text: async () => '' };
    }),
    /robots 허용/,
  );
  assert.equal(called, false);
});

test('자동 수집은 timeout·식별 User-Agent 계약으로 요청한다', async () => {
  const calls = [];
  const raw = await fetchDetailRaw({ id: 'allowed', sourceUrl: 'https://example.com/detail', method: 'html', robots: { status: 'allowed' } }, async (url, init) => {
    calls.push(url);
    assert.match(init.headers['User-Agent'], /ExamMoa-DetailCollector/);
    assert.ok(init.signal);
    if (url.endsWith('/robots.txt')) return { status: 200, text: async () => 'User-agent: *\nAllow: /' };
    return {
      ok: true, status: 200,
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      arrayBuffer: async () => new TextEncoder().encode('<html>ok</html>').buffer,
    };
  });
  assert.deepEqual(calls, ['https://example.com/robots.txt', 'https://example.com/detail']);
  assert.equal(raw, '<html>ok</html>');
});

test('실시간 robots가 일시 보류면 공식 페이지를 요청하지 않는다', async () => {
  const calls = [];
  await assert.rejects(fetchDetailRaw({
    id: 'allowed', sourceUrl: 'https://example.com/detail', method: 'html', robots: { status: 'allowed' },
  }, async url => {
    calls.push(url);
    return { status: 503, text: async () => '' };
  }), /robots 보류/);
  assert.deepEqual(calls, ['https://example.com/robots.txt']);
});
