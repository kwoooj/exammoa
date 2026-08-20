// 금융투자협회 투자자산운용사 공식 연간일정 API.

import { parseTiming } from '../lib/kdate.mjs';

export const id = 'kofia-investment';
export const method = 'crawl';
export const groupId = 'kofia-investment-manager';
export const archiveExt = 'json';

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
  const selected = rows.filter(row => row.licenseCd === 'FWM006' && Number(row.standardY) === year);
  const failures = [];
  const sessions = [];

  for (const row of selected) {
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
      id: `${groupId}-${year}-${seq}`,
      groupId,
      year,
      seq,
      label: `제${seq}회`,
      mode: 'scheduled',
      status: 'confirmed',
      events,
    });
  }

  sessions.sort((a, b) => a.seq - b.seq);
  return {
    sessions,
    diagnostics: {
      rows: selected.length,
      parsed: sessions.length,
      headerMatch: Array.isArray(payload?.api?.examSchedList) && selected.length > 0,
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
