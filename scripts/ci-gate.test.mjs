// node --test scripts/ci-gate.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, subject, summary } from './ci-gate.mjs';

const ok = (over = {}) => ({
  fetchedAt: '2026-08-13T07:12:52.130Z',
  examCount: 51,
  groupCount: 11,
  sessionCount: 169,
  eventCount: 744,
  staleCount: 0,
  groupSplitCount: 0,
  groupSplits: [],
  sources: {
    qnet: { health: 'ok', method: 'api', sessionCount: 102 },
    'history-exam': { health: 'ok', method: 'crawl', sessionCount: 5 },
  },
  ...over,
});

// ---- 정상 -------------------------------------------------------------

test('전부 정상이면 커밋하고 초록불', () => {
  const d = decide(ok());
  assert.equal(d.commit, true);
  assert.equal(d.fail, false);
});

test('요약에 그룹·회차·소스가 들어간다', () => {
  const s = summary(decide(ok()));
  assert.match(s, /그룹 11개/);
  assert.match(s, /회차 169건/);
  assert.match(s, /qnet=ok\(102\)/);
});

// ---- 소스 실패 → 커밋하고 빨간불 ----------------------------------------

test('소스가 죽으면 커밋한다 — 직전 값이 stale 로 남아 있다', () => {
  const d = decide(ok({
    staleCount: 102,
    sources: {
      qnet: { health: 'stale', method: 'api', sessionCount: 102, error: 'HTTP 500' },
      'history-exam': { health: 'ok', method: 'crawl', sessionCount: 5 },
    },
  }));
  assert.equal(d.commit, true, '커밋하지 않으면 폴백이 저장소에 남지 않는다');
  assert.equal(d.fail, true, '조용히 초록불이면 사람이 모른다');
});

test('실패한 소스의 id 와 사유를 요약에 적는다', () => {
  const s = summary(decide(ok({
    sources: { qnet: { health: 'failed', method: 'api', sessionCount: 0, error: '인증 실패' } },
  })));
  assert.match(s, /qnet/);
  assert.match(s, /인증 실패/);
});

test('store.mjs 가 쓰는 필드 이름은 reason 이다 — error 만 보면 사유가 안 보인다', () => {
  const s = summary(decide(ok({
    sources: { qnet: { health: 'stale', method: 'api', sessionCount: 102, reason: '거절 22 일일 요청제한 횟수 초과' } },
  })));
  assert.match(s, /일일 요청제한/);
});

test('health 가 failed 든 stale 든 커밋한다', () => {
  for (const health of ['stale', 'failed']) {
    const d = decide(ok({ sources: { qnet: { health, sessionCount: 0 } } }));
    assert.equal(d.commit, true, health);
    assert.equal(d.fail, true, health);
  }
});

// ---- 그룹 갈림 → 커밋하지 않는다 ----------------------------------------

test('그룹이 갈리면 커밋하지 않는다', () => {
  const d = decide(ok({
    groupSplitCount: 1,
    groupSplits: [{
      groupId: 'hrdk-regular',
      variantCount: 2,
      variants: [
        { groupId: 'hrdk-regular--정보처리기사', examSlugs: ['정보처리기사'], sessionCount: 3 },
        { groupId: 'hrdk-regular--위험물산업기사', examSlugs: ['위험물산업기사', '건설안전기사'], sessionCount: 3 },
      ],
    }],
  }));
  assert.equal(d.commit, false, 'groupId 가 바뀐 산출물을 커밋하면 저장된 계획이 깨진다');
  assert.equal(d.fail, true);
});

test('갈린 그룹의 새 id 를 요약에 적는다 — 시드를 고칠 사람에게 필요하다', () => {
  const s = summary(decide(ok({
    groupSplitCount: 1,
    groupSplits: [{
      groupId: 'hrdk-regular',
      variantCount: 2,
      variants: [
        { groupId: 'hrdk-regular--정보처리기사', examSlugs: ['정보처리기사'], sessionCount: 3 },
        { groupId: 'hrdk-regular--위험물산업기사', examSlugs: ['위험물산업기사'], sessionCount: 3 },
      ],
    }],
  })));
  assert.match(s, /hrdk-regular--정보처리기사/);
  assert.match(s, /groups\.seed\.json/);
});

test('그룹 갈림이 소스 실패보다 우선한다 — 둘 다면 커밋하지 않는다', () => {
  const d = decide(ok({
    groupSplitCount: 1,
    groupSplits: [{ groupId: 'g', variantCount: 2, variants: [] }],
    sources: { qnet: { health: 'stale', sessionCount: 102 } },
  }));
  assert.equal(d.commit, false);
});

test('groupSplitCount 가 없어도 groupSplits 로 판정한다', () => {
  const m = ok({ groupSplits: [{ groupId: 'g', variantCount: 2, variants: [] }] });
  delete m.groupSplitCount;
  assert.equal(decide(m).commit, false);
});

// ---- 산출물 없음 ------------------------------------------------------

test('meta 를 못 읽으면 커밋하지 않고 빨간불', () => {
  for (const bad of [null, undefined, 'oops']) {
    const d = decide(bad);
    assert.equal(d.commit, false, String(bad));
    assert.equal(d.fail, true, String(bad));
  }
});

test('sources 가 비어도 죽지 않는다', () => {
  const d = decide(ok({ sources: {} }));
  assert.equal(d.commit, true, '소스 기록이 없는 것과 실패는 다르다');
  assert.equal(d.fail, false);
});

// ---- 요약 표시 --------------------------------------------------------

test('커밋하면서 실패한 경우와 커밋조차 못 한 경우를 다른 기호로 구분한다', () => {
  const warn = summary(decide(ok({ sources: { qnet: { health: 'stale', sessionCount: 1 } } })));
  const stop = summary(decide(ok({ groupSplitCount: 1, groupSplits: [{ groupId: 'g', variants: [] }] })));
  assert.match(warn, /⚠️/);
  assert.match(stop, /❌/);
  assert.match(summary(decide(ok())), /✅/);
});

test('stale 회차 수가 있으면 요약에 적는다', () => {
  const s = summary(decide(ok({ staleCount: 102, sources: { qnet: { health: 'stale', sessionCount: 102 } } })));
  assert.match(s, /낡은 회차 102건/);
});

// ---- 종목 단위 실패 (#18) ----------------------------------------------

test('소스는 건강한데 종목이 빠지면 커밋하고 빨간불', () => {
  const d = decide(ok({
    failed: [
      { slug: '품질경영기사', jmCd: '1500', reason: '레코드 없음' },
      { slug: '전기기사', jmCd: '1150', reason: '레코드 없음' },
    ],
  }));
  assert.equal(d.commit, true, '나머지 종목은 정상이다. 되돌리면 오늘 확정된 일정을 잃는다');
  assert.equal(d.fail, true, '조용히 초록불이면 그룹이 사라진 것을 아무도 모른다');
  assert.match(d.headline, /2건/);
});

test('빠진 종목을 사유별로 묶는다 — 29줄을 찍으면 요약을 읽지 않게 된다', () => {
  const failed = Array.from({ length: 29 }, (_, i) => ({
    slug: `종목${i}`, jmCd: String(1000 + i), reason: '레코드 없음',
  }));
  const s = summary(decide(ok({ failed })));
  assert.match(s, /레코드 없음 \(29건\)/);
  assert.match(s, /외 23건/, '앞 6건만 보이고 나머지는 개수로 접혀야 한다');
  assert.ok(s.split('\n').length < 15, `요약이 너무 길다 (${s.split('\n').length}줄)`);
});

test('소스 실패가 종목 실패보다 앞선다 — 둘 다면 소스 얘기를 먼저 한다', () => {
  const d = decide(ok({
    sources: { qnet: { health: 'stale', sessionCount: 102 } },
    failed: [{ slug: 'x', reason: '레코드 없음' }],
  }));
  assert.match(d.headline, /소스/);
  assert.equal(d.commit, true);
  assert.match(summary(d), /빠진 종목 1건/, '종목 실패도 함께 적어야 한다');
});

test('그룹 갈림은 종목 실패보다 앞서고 커밋을 막는다', () => {
  const d = decide(ok({
    groupSplitCount: 1,
    groupSplits: [{ groupId: 'g', variants: [] }],
    failed: [{ slug: 'x', reason: '레코드 없음' }],
  }));
  assert.equal(d.commit, false);
});

test('failed 가 빈 배열이면 정상이다', () => {
  const d = decide(ok({ failed: [] }));
  assert.equal(d.fail, false);
});

// ---- 커밋 제목 --------------------------------------------------------

test('커밋 제목에 수집 날짜와 회차 수가 들어간다', () => {
  const m = ok();
  assert.equal(subject(decide(m), m), '데이터 갱신 2026-08-13 — 회차 169건');
});

test('일부 실패한 커밋은 제목으로 구분된다 — git log 만 봐도 알아야 한다', () => {
  const m = ok({ sources: { qnet: { health: 'stale', sessionCount: 102 } } });
  assert.match(subject(decide(m), m), /일부 실패/);
});

test('커밋 제목은 한 줄이다 — GITHUB_OUTPUT 이 줄바꿈을 값의 끝으로 읽는다', () => {
  // slice(0,10) 안에 줄바꿈이 남는 값. meta.json 이 오염되면 실제로 이렇게 된다.
  const m = ok({ fetchedAt: '26\nfail=false' });
  const s = subject(decide(m), m);
  assert.ok(!s.includes('\n'), `줄바꿈이 들어갔다: ${JSON.stringify(s)}`);
  assert.ok(!s.includes('\r'));
});

test('meta 가 없어도 제목을 만든다', () => {
  assert.match(subject(decide(null), null), /날짜불명/);
});
