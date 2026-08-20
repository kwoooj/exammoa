// 한국재무설계협회 AFPK 공식 회차별 일정표.

import { normalizeText, parseTiming, tryParseRange } from '../lib/kdate.mjs';

export const id = 'ifpk-afpk';
export const method = 'crawl';
export const groupId = 'ifpk-afpk';
export const EXPECT_HEADERS = ['AFPK 자격시험 일정'];

export function parse(html, { year }) {
  const text = normalizeText(html);
  const marker = `${year}년도 제`;
  const blocks = text.split(new RegExp(`(?=${year}년도 제\\d+차)`)).filter(block => block.startsWith(marker));
  const sessions = [];
  const failures = [];

  for (const block of blocks) {
    const seq = Number(block.match(/\((\d+)회\)\s*AFPK/)?.[1]);
    const examText = block.match(/시행일\s*:\s*(.*?)\s*원서접수/)?.[1];
    const regText = block.match(/원서접수\s+(.*?)\s+원서접수 변경/)?.[1];
    const resultText = block.match(/결과 발표\s+(.*?)(?=\s+\(시험|\s+시험 일정은|\s*$)/)?.[1];
    if (!Number.isFinite(seq)) continue;

    const events = [];
    const add = (kind, value, label) => {
      const parsed = tryParseRange(value, { year });
      if (!parsed.ok) {
        failures.push({ seq, label, reason: parsed.reason, raw: parsed.raw });
        return;
      }
      const timing = parseTiming(value);
      events.push({
        kind,
        phase: 'single',
        start: parsed.value.start,
        end: kind === 'reg' ? parsed.value.end : parsed.value.start,
        seq: 1,
        label,
        note: null,
        ...(timing ? { timing } : {}),
      });
    };
    add('reg', regText, '원서접수');
    add('exam', examText, '시험');
    add('result', resultText, '합격자발표');
    if (!events.length) continue;
    events.sort((a, b) => a.start.localeCompare(b.start) || a.seq - b.seq);
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
      rows: blocks.length,
      parsed: sessions.length,
      headerMatch: text.includes(`${year}년도 AFPK 자격시험 일정`) && sessions.length === 3,
      failures,
    },
  };
}
