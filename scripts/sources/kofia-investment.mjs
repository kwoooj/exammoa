// 금융투자협회 공식 연간일정 API의 8개 자격 전수.

import { normalizeText, parseTiming } from '../lib/kdate.mjs';
import { sourceCoverage } from '../lib/source-coverage.mjs';

export const id = 'kofia-investment';
export const method = 'crawl';
export const groupId = 'kofia-investment-manager';
export const archiveExt = 'json';

export const TARGETS = {
  FCS005: { groupId: 'kofia-securities-adviser', name: '증권투자권유자문인력' },
  FCF008: { groupId: 'kofia-fund-adviser', name: '펀드투자권유자문인력' },
  FCD006: { groupId: 'kofia-derivatives-adviser', name: '파생상품투자권유자문인력' },
  SCS003: { groupId: 'kofia-securities-agent', name: '증권투자권유대행인' },
  SCF003: { groupId: 'kofia-fund-agent', name: '펀드투자권유대행인' },
  FWM006: { groupId: 'kofia-investment-manager', name: '투자자산운용사' },
  FWR005: { groupId: 'kofia-financial-analyst', name: '금융투자분석사' },
  FWD003: { groupId: 'kofia-risk-manager', name: '재무위험관리사' },
};

const sourceKey = row => `${String(row.licenseCd)}|${normalizeText(row.koreanExamNm)}`;
const expectedKeys = () => Object.entries(TARGETS).map(([code, target]) => `${code}|${target.name}`);

const dateOf = value => {
  const match = String(value ?? '').match(/^(20\d{2})(\d{2})(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
};

const clockOf = value => {
  const match = String(value ?? '').match(/^(?:20\d{6})?(\d{2})(\d{2})(?:\d{2})?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? `${match[1]}:${match[2]}` : null;
};

const timing = (start, end = null) => start ? {
  start,
  ...(end ? { end } : {}),
  timezone: 'Asia/Seoul',
  status: 'confirmed',
} : null;

export function parse(raw, { year }) {
  let payload;
  try {
    payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return { sessions: [], diagnostics: { rows: 0, parsed: 0, headerMatch: false, failures: [] } };
  }
  const rows = Array.isArray(payload?.api?.examSchedList) ? payload.api.examSchedList : [];
  const yearRows = rows.filter(row => Number(row.standardY) === year);
  const selected = yearRows.filter(row => {
    const target = TARGETS[String(row.licenseCd)];
    return target && normalizeText(row.koreanExamNm) === target.name;
  });
  const failures = [];
  const sessions = [];

  for (const row of selected) {
    const target = TARGETS[String(row.licenseCd)];
    const seq = Number(row.timeCnt);
    const regStart = dateOf(row.receiptSrtDtTm);
    const regEnd = dateOf(row.receiptEndDtTm);
    const examDate = dateOf(row.examinationDt);
    const resultDate = dateOf(row.successAnnDt);
    if (!Number.isFinite(seq) || !regStart || !regEnd || !examDate || !resultDate) {
      failures.push({ seq: row.timeCnt, label: '일정', reason: 'invalid-date', raw: JSON.stringify(row) });
      continue;
    }
    const regTiming = timing(clockOf(row.receiptSrtDtTm), clockOf(row.receiptEndDtTm));
    const examTiming = parseTiming(row.examinationTm);
    const resultTiming = timing(clockOf(row.successManAnnTm));
    const events = [
      { kind: 'reg', phase: 'single', start: regStart, end: regEnd, seq: 1, label: '원서접수', note: null, ...(regTiming ? { timing: regTiming } : {}) },
      { kind: 'exam', phase: 'single', start: examDate, end: examDate, seq: 1, label: '시험', note: null, ...(examTiming ? { timing: examTiming } : {}) },
      { kind: 'result', phase: 'single', start: resultDate, end: resultDate, seq: 1, label: '합격자발표', note: null, ...(resultTiming ? { timing: resultTiming } : {}) },
    ].sort((a, b) => a.start.localeCompare(b.start) || a.seq - b.seq);
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
      headerMatch: Array.isArray(payload?.api?.examSchedList),
      coverage: sourceCoverage({
        discovered: yearRows.map(sourceKey),
        included: selected.map(sourceKey),
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
  const endpoint = new URL('/examInfo/ajax/examYearlyMstInfo.do', url);
  const apiResponse = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
    body: new URLSearchParams({ rcptSttType: 'ALL', licenseCd: 'ALL' }),
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
