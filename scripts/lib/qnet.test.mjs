// node --test scripts/lib/qnet.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAILURE_TOLERANCE, classifyResponse, rejectionMessage, sourceHealth } from './qnet.mjs';

/** 실측: HTTP 429 로 온 213 byte 본문 그대로 */
const QUOTA_BODY = JSON.stringify({
  OpenAPI_ServiceResponse: {
    cmmMsgHeader: {
      errMsg: 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR',
      returnAuthMsg: '일일 서비스 요청제한 횟수 초과 에러',
      returnReasonCode: '22',
    },
  },
});

const res = (over = {}) => {
  const text = over.text ?? '{}';
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* XML 등 */ }
  return { status: 200, text, parsed, items: [], ...over, ...(over.parsed === undefined ? { parsed } : {}) };
};

const record = { implYy: '2026', implSeq: '3', qualgbCd: 'T', docRegStartDt: '20260720' };

// ---- 정상 -------------------------------------------------------------

test('레코드가 있으면 ok', () => {
  const v = classifyResponse(res({ text: '{}', items: [record] }));
  assert.equal(v.kind, 'ok');
  assert.equal(v.reason, null);
});

test('resultCode 표기가 갈려도 통과한다', () => {
  for (const code of ['00', '0', '000', 'INFO-000']) {
    const text = JSON.stringify({ header: { resultCode: code, resultMsg: 'OK' } });
    assert.equal(classifyResponse(res({ text, items: [record] })).kind, 'ok', code);
  }
});

test('header 가 response 안에 있어도 읽는다', () => {
  const text = JSON.stringify({ response: { header: { resultCode: '99', resultMsg: '나쁨' } } });
  const v = classifyResponse(res({ text, items: [record] }));
  assert.equal(v.kind, 'exam-failed');
  assert.match(v.reason, /99/);
});

// ---- 429 / 한도 초과 → 소스 실패 ----------------------------------------

test('일일 한도 초과는 소스 실패다 — 이게 #18 의 본체다', () => {
  const v = classifyResponse(res({ status: 429, text: QUOTA_BODY, items: [] }));
  assert.equal(v.kind, 'source-failed', '"레코드 없음" 으로 세면 29종목이 조용히 사라진다');
  assert.match(v.reason, /22/);
  assert.match(v.reason, /일일 요청제한/);
});

test('본문 없는 429 도 소스 실패다', () => {
  const v = classifyResponse({ status: 429, text: '', parsed: null, items: [] });
  assert.equal(v.kind, 'source-failed');
});

test('키·기간·IP 문제도 계정 단위라 소스 실패다', () => {
  for (const [code, hint] of [['30', /서비스키/], ['31', /만료/], ['32', /IP/], ['20', /거부/], ['12', /폐기/]]) {
    const text = JSON.stringify({
      OpenAPI_ServiceResponse: { cmmMsgHeader: { returnReasonCode: code, returnAuthMsg: 'x' } },
    });
    const v = classifyResponse(res({ status: 401, text, items: [] }));
    assert.equal(v.kind, 'source-failed', code);
    assert.match(v.reason, hint, code);
  }
});

test('모르는 거절 코드는 종목 실패로 둔다 — 계정 단위라고 단정하지 않는다', () => {
  const text = JSON.stringify({
    OpenAPI_ServiceResponse: { cmmMsgHeader: { returnReasonCode: '99', returnAuthMsg: '알 수 없는 오류' } },
  });
  const v = classifyResponse(res({ status: 400, text, items: [] }));
  assert.equal(v.kind, 'exam-failed');
  assert.match(v.reason, /알 수 없는 오류/);
});

test('XML 로 온 거절도 읽는다', () => {
  const xml = '<OpenAPI_ServiceResponse><cmmMsgHeader>'
    + '<errMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</errMsg>'
    + '<returnAuthMsg>일일 서비스 요청제한 횟수 초과 에러</returnAuthMsg>'
    + '<returnReasonCode>22</returnReasonCode>'
    + '</cmmMsgHeader></OpenAPI_ServiceResponse>';
  const v = classifyResponse({ status: 429, text: xml, parsed: null, items: [] });
  assert.equal(v.kind, 'source-failed');
});

// ---- 그 밖의 종목 실패 --------------------------------------------------

test('레코드 0건은 종목 실패다 — 화이트리스트는 전부 응답한다고 실측됐다', () => {
  const v = classifyResponse(res({ text: '{}', items: [] }));
  assert.equal(v.kind, 'exam-failed');
  assert.equal(v.reason, '레코드 없음');
});

test('items 가 null 이어도 죽지 않는다', () => {
  assert.equal(classifyResponse(res({ text: '{}', items: null })).kind, 'exam-failed');
});

test('JSON 이 아니고 거절도 아니면 종목 실패', () => {
  const v = classifyResponse({ status: 200, text: '<html>어라</html>', parsed: null, items: null });
  assert.equal(v.kind, 'exam-failed');
  assert.match(v.reason, /JSON 파싱 실패/);
});

// ---- rejectionMessage -------------------------------------------------

test('거절이 아니면 null — 진단 경로가 정상을 오탐하지 않게', () => {
  assert.equal(rejectionMessage({ header: { resultCode: '00' } }, '{}'), null);
  assert.equal(rejectionMessage(null, '<html></html>'), null);
});

test('거절이면 한 줄로 준다', () => {
  assert.match(rejectionMessage(JSON.parse(QUOTA_BODY), QUOTA_BODY), /거절 22 일일 요청제한/);
});

// ---- sourceHealth -----------------------------------------------------

test('계정 단위 거절이면 종목 성공 수와 무관하게 소스 실패', () => {
  const h = sourceHealth({ total: 47, failed: 1, sourceFailure: 'HTTP 429 요청 제한' });
  assert.equal(h.ok, false);
  assert.match(h.error, /429/);
});

test('실측 사례 재현 — 47종목 중 29건 실패는 소스 실패다', () => {
  const h = sourceHealth({ total: 47, failed: 29 });
  assert.equal(h.ok, false, 'health:ok 로 남으면 stale 폴백이 작동하지 않는다');
  assert.match(h.error, /29건/);
});

test('일부 실패는 통과한다 (FR-DAT-06)', () => {
  assert.equal(sourceHealth({ total: 47, failed: 0 }).ok, true);
  assert.equal(sourceHealth({ total: 47, failed: 1 }).ok, true);
  assert.equal(sourceHealth({ total: 47, failed: 15 }).ok, true, '15/47 은 1/3 이하다');
});

test('허용치 경계', () => {
  const total = 30;
  const edge = Math.floor(total * FAILURE_TOLERANCE);
  assert.equal(sourceHealth({ total, failed: edge }).ok, true, `${edge}/${total}`);
  assert.equal(sourceHealth({ total, failed: edge + 1 }).ok, false, `${edge + 1}/${total}`);
});

test('전부 실패와 대상 없음을 구분해 적는다', () => {
  assert.match(sourceHealth({ total: 47, failed: 47 }).error, /전부 실패/);
  assert.match(sourceHealth({ total: 0, failed: 0 }).error, /대상 종목이 없다/);
});
