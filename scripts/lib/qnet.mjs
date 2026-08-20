// Q-Net(공공데이터포털) 응답 분류. 의존성 없음.
//
// 이 파일이 존재하는 이유: **거절을 빈 응답으로 읽어 29종목이 조용히 사라졌다** (#18).
//
// 포털은 거절을 두 가지 전혀 다른 형태로 준다.
//
//   ① HTTP 4xx + OpenAPI_ServiceResponse.cmmMsgHeader
//        { errMsg: 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR',
//          returnAuthMsg: '일일 서비스 요청제한 횟수 초과 에러', returnReasonCode: '22' }
//        header/body 구조가 아니라서 extractItems() 가 빈 배열을 돌려준다.
//
//   ② HTTP 200 + header.resultCode 가 00 이 아님
//
// 둘 다 "레코드 0건" 으로 집계되면 종목이 사라진 채 health: 'ok' 가 된다.
//
// 그리고 **종목 실패와 소스 실패는 다르다.**
//   종목 실패 — 이 요청만 잘못됐다. 다음 종목은 시도할 가치가 있다.
//   소스 실패 — 계정·서비스 단위로 막혔다. 남은 46번을 더 두드리는 것은 무의미하고 무례하다.
//              직전 값을 stale 로 유지해야 한다 (FR-DAT-07).

/**
 * 계정·서비스 단위로 막힌 사유. 재시도해도 같은 답이 온다.
 * 출처: 공공데이터포털 공통 에러코드.
 */
export const SOURCE_LEVEL_REASONS = new Map([
  ['12', '해당 오픈API 서비스가 없거나 폐기됨'],
  ['20', '서비스 접근 거부'],
  ['22', '일일 요청제한 횟수 초과'],
  ['30', '등록되지 않은 서비스키'],
  ['31', '활용기간 만료'],
  ['32', '등록되지 않은 IP'],
]);

/** 성공을 뜻하는 resultCode. 서비스마다 표기가 갈린다. */
const OK_CODES = new Set(['00', '0', '000', 'INFO-000', 'INFO-00']);

/** `{OpenAPI_ServiceResponse:{cmmMsgHeader:{...}}}` — 거절 전용 형태 */
function rejectionOf(parsed, text) {
  const h = parsed?.OpenAPI_ServiceResponse?.cmmMsgHeader
    ?? parsed?.OpenAPI_ServiceResponse?.CmmMsgHeader
    ?? null;
  if (h) {
    return {
      code: String(h.returnReasonCode ?? ''),
      message: String(h.returnAuthMsg ?? h.errMsg ?? '').trim(),
    };
  }
  // XML 로 오는 경우도 있다. 파싱 실패한 본문에서 직접 긁는다.
  if (!parsed && typeof text === 'string') {
    const code = text.match(/<returnReasonCode>\s*(\d+)\s*<\/returnReasonCode>/)?.[1];
    if (code) {
      const msg = text.match(/<returnAuthMsg>(.*?)<\/returnAuthMsg>/)?.[1]
        ?? text.match(/<errMsg>(.*?)<\/errMsg>/)?.[1] ?? '';
      return { code: String(code), message: String(msg).trim() };
    }
  }
  return null;
}

/**
 * 거절 사유 한 줄. 거절이 아니면 null.
 *
 * 진단 경로(`--probe`)도 이걸 봐야 한다. `header.resultCode` 만 보던 시절에는 429 를
 * 받고도 "정상" 으로 찍었다 — 진단 도구가 거짓말하면 조사가 처음부터 틀어진다.
 */
export function rejectionMessage(parsed, text) {
  const r = rejectionOf(parsed, text);
  if (!r) return null;
  return `거절 ${r.code} ${SOURCE_LEVEL_REASONS.get(r.code) ?? r.message}`.trim();
}

/** `{header:{...}}` 또는 `{response:{header:{...}}}` */
function headerOf(parsed) {
  return parsed?.header ?? parsed?.response?.header ?? null;
}

/**
 * 한 종목 응답을 분류한다.
 *
 * @param {{status:number, text:string, parsed:object|null, items:object[]|null}} res
 * @returns {{kind:'ok'|'exam-failed'|'source-failed', reason:string|null}}
 */
export function classifyResponse({ status, text = '', parsed = null, items = null }) {
  const rejection = rejectionOf(parsed, text);
  if (rejection) {
    const known = SOURCE_LEVEL_REASONS.get(rejection.code);
    const reason = `거절 ${rejection.code} ${known ?? rejection.message}`.trim();
    // 한도 초과·키 문제는 계정 단위다. 남은 종목을 두드려도 같은 답이 온다.
    return { kind: known ? 'source-failed' : 'exam-failed', reason };
  }

  // 429 는 본문 없이 올 수도 있다. 이것도 계정 단위다.
  if (status === 429) {
    return { kind: 'source-failed', reason: 'HTTP 429 요청 제한' };
  }

  if (!parsed) {
    return { kind: 'exam-failed', reason: `JSON 파싱 실패 — ${String(text).slice(0, 160)}` };
  }

  const h = headerOf(parsed);
  if (h) {
    const code = String(h.resultCode ?? '');
    if (!OK_CODES.has(code)) {
      return { kind: 'exam-failed', reason: `API 오류 ${code} ${h.resultMsg ?? ''}`.trim() };
    }
  }

  // 여기까지 왔으면 응답 자체는 정상이다.
  //
  // 그래도 0건은 실패로 센다. 호출하는 47종목은 **전부 응답한다고 실측된** 화이트리스트다
  // (타기관 시행 6종목은 pickExams 가 이미 걸러낸다). 0건은 이상 신호이지 정상이 아니다.
  if (!items?.length) {
    return { kind: 'exam-failed', reason: '레코드 없음' };
  }

  if (status < 200 || status >= 300) {
    return { kind: 'exam-failed', reason: `HTTP ${status}` };
  }

  return { kind: 'ok', reason: null };
}

/**
 * 종목별 결과를 소스 건강도로 접는다.
 *
 * @param {{total:number, failed:number, sourceFailure:string|null}} counts
 * @returns {{ok:boolean, error:string|null}}
 */
export function sourceHealth({ total, failed, sourceFailure = null }) {
  if (sourceFailure) return { ok: false, error: sourceFailure };
  if (total === 0) return { ok: false, error: '수집 대상 종목이 없다' };
  if (failed >= total) return { ok: false, error: `${total}종목 전부 실패` };
  // 화이트리스트 종목은 모두 응답한다고 실측됐다. 한 종목이라도 실패한 부분 결과를
  // 정상 게시하면 그 종목의 단독 그룹이 사라진다. 소스 전체를 실패시켜 직전 Q-Net
  // 세션을 stale로 계승하고, 다른 독립 소스의 성공 결과는 그대로 발행한다(FR-DAT-06).
  if (failed > 0) {
    return { ok: false, error: `${total}종목 중 ${failed}건 실패 — 직전 Q-Net 데이터를 유지한다` };
  }
  return { ok: true, error: null };
}
