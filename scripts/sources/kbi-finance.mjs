// 한국금융연수원 공식 연간일정 API의 18개 자격 전수.
//
// 공개 시험일정 화면은 날짜 목록을 JSON으로 내려준다. 화면에 명시된 공통 접수시간
// (시작 10:00, 마감 20:00)과 JSON의 시험시간을 함께 보존한다. 일정이 서로 다른 각
// 자격을 한 소스에서 받되 세션 groupId는 분리한다.

import { normalizeText, parseTiming, tryParseRange } from '../lib/kdate.mjs';
import { sourceCoverage } from '../lib/source-coverage.mjs';

export const id = 'kbi-finance';
export const method = 'crawl';
export const groupId = 'kbi-credit-analyst';
export const archiveExt = 'json';

export const TARGETS = {
  '01': { groupId: 'kbi-credit-analyst', name: '신용분석사' },
  '02': { groupId: 'kbi-loan-officer', name: '여신심사역' },
  '03': { groupId: 'kbi-international-finance', name: '국제금융역' },
  '04': { groupId: 'kbi-financial-planner', name: '자산관리사(FP)' },
  '05': { groupId: 'kbi-credit-risk-analyst', name: '신용위험분석사(CRA)' },
  '07': { groupId: 'kbi-bank-teller', name: '은행텔러' },
  '09': { groupId: 'kbi-foreign-exchange-1', name: '외환전문역Ⅰ종' },
  '10': { groupId: 'kbi-foreign-exchange-2', name: '외환전문역Ⅱ종' },
  '14': { groupId: 'kbi-compliance-bank', name: '영업점 컴플라이언스 오피서(은행)' },
  '15': { groupId: 'kbi-compliance-insurance', name: '영업점 컴플라이언스 오피서(보험)' },
  '16': { groupId: 'kbi-compliance-securities', name: '영업점 컴플라이언스 오피서(증권)' },
  '21': { groupId: 'kbi-nh-personal-credit', name: '농협은행 개인여신전문역' },
  '24': { groupId: 'kbi-nh-sme-credit', name: '농협은행 중소기업 심사역' },
  '25': { groupId: 'kbi-private-banker', name: '프라이빗뱅커' },
  '26': { groupId: 'kbi-finance-dt', name: 'KBI 금융DT 테스트' },
  '28': { groupId: 'kbi-aml', name: '자금세탁방지 업무능력 검정시험' },
  '29': { groupId: 'kbi-suhyup-sca', name: '수협은행 직무역량평가(SCA)' },
  '30': { groupId: 'kbi-finance-ai-literacy', name: 'KBI 금융 AI 리터러시' },
};

const withYear = (text, year) => `${year}.${String(text ?? '').trim()}`;
const sourceKey = row => `${String(row.I_QLFN)}|${normalizeText(row.N_QLFN)}`;
const expectedKeys = () => Object.entries(TARGETS).map(([code, target]) => `${code}|${target.name}`);

export function parse(raw, { year }) {
  let payload;
  try {
    payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return { sessions: [], diagnostics: { rows: 0, parsed: 0, headerMatch: false, failures: [] } };
  }

  const pageText = normalizeText(payload?.schedulePage);
  const clockMatch = pageText.match(/원서접수\s*\(\s*시작일\s*(\d{1,2}:\d{2})\s*~\s*마감일\s*(\d{1,2}:\d{2})\s*\)/);
  const rows = Array.isArray(payload?.api?.ds) ? payload.api.ds : [];
  const yearRows = rows.filter(row => Number(row.D_YY) === year);
  const targetRows = yearRows.filter(row => {
    const target = TARGETS[String(row.I_QLFN)];
    return target && normalizeText(row.N_QLFN) === target.name;
  });
  const structureOk = Boolean(clockMatch) && Array.isArray(payload?.api?.ds);
  const failures = [];
  const sessions = [];

  const add = (events, row, kind, text, label, timingText = text) => {
    // 공식 API가 접수일 미공고 회차를 `~` 한 글자로 보낸다. 누락 날짜를 만들지는
    // 않되, 알려진 빈 표기를 파싱 실패로 오인하지도 않는다.
    if (!String(text ?? '').replace(/[~∼〜～.\s]/g, '')) return;
    const result = tryParseRange(withYear(text, year), { year, requireYear: true });
    if (!result.ok) {
      failures.push({ seq: row.Q_SEQ, label, reason: result.reason, raw: result.raw });
      return;
    }
    const end = kind === 'reg' ? result.value.end : result.value.start;
    const timing = parseTiming(timingText);
    events.push({
      kind,
      phase: 'single',
      start: result.value.start,
      end,
      seq: 1,
      label,
      note: null,
      ...(timing ? { timing } : {}),
    });
  };

  for (const row of targetRows) {
    const target = TARGETS[String(row.I_QLFN)];
    const seq = Number(row.Q_SEQ);
    if (!target || !Number.isFinite(seq)) continue;
    const events = [];
    add(events, row, 'reg', row.D_INT_ACPT_DT, '원서접수', `${clockMatch?.[1] ?? ''} ~ ${clockMatch?.[2] ?? ''}`);
    add(events, row, 'exam', row.D_OF_APPR, '시험', row.EAXM_PERIOD);
    add(events, row, 'result', row.D_SUCC_ANNO, '합격자발표', row.D_SUCC_ANNO);
    if (!events.length) continue;
    events.sort((a, b) => a.start.localeCompare(b.start) || a.seq - b.seq);
    sessions.push({
      id: `${target.groupId}-${year}-${seq}`,
      groupId: target.groupId,
      year,
      seq,
      label: `제${seq}회`,
      mode: 'scheduled',
      status: 'confirmed',
      events,
    });
  }

  sessions.sort((a, b) => a.groupId.localeCompare(b.groupId) || a.seq - b.seq);
  return {
    sessions,
    diagnostics: {
      rows: yearRows.length,
      parsed: sessions.length,
      headerMatch: structureOk,
      coverage: sourceCoverage({
        discovered: yearRows.map(sourceKey),
        included: targetRows.map(sourceKey),
        expected: expectedKeys(),
      }),
      failures,
    },
  };
}

export async function collect({ fetchImpl, url, year, headers }) {
  const pageResponse = await fetchImpl(url, {
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  });
  if (!pageResponse.ok) throw new Error(`일정 화면 HTTP ${pageResponse.status}`);
  const schedulePage = await pageResponse.text();

  const endpoint = new URL('/platformWeb/Qual.do?cmd=qualTestScheduleList', url);
  const body = new URLSearchParams({
    l_pageno: '1',
    l_listscale: '200',
    p_sortorder: 'QUAL_TYPE, D_YY, I_QLFN, Q_NUM',
    p_dYy: String(year),
    p_qualType: '',
    p_nQlfn: '',
  });
  const apiResponse = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
    body,
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  });
  if (!apiResponse.ok) throw new Error(`일정 API HTTP ${apiResponse.status}`);
  const apiText = await apiResponse.text();
  let api;
  try {
    api = JSON.parse(apiText);
  } catch {
    throw new Error('일정 API가 JSON을 반환하지 않았다');
  }
  const raw = JSON.stringify({ schedulePage, api });
  return { ...parse(raw, { year }), raw };
}
