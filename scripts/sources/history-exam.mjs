// 한국사능력검정시험 (국사편찬위원회) 어댑터.
//
// 첫 크롤 어댑터로 고른 이유: priority 1 이고, 마크업이 정상이고(<tr> 19/19), 표 헤더가
// 이벤트 종류에 1:1 로 대응한다.
//
//   구분 | 원서접수 | 취소좌석 접수 | 시험일시 | 합격자발표
//
// '취소좌석 접수' 는 공단의 빈자리접수와 같은 성격이라 reg 의 seq 2 로 넣는다.
// 심화(1~3급)와 기본(4~6급)이 같은 날 시행되므로 한 그룹으로 둔다 — phase 는 single.
//
// robots.txt 가 없다 (HTTP 404 = RFC 9309 전면 허용). 확인은 npm run probe:crawl.

import { tryParseRange } from '../lib/kdate.mjs';
import { readTables, rowsAsObjects, tableByHeader } from '../lib/html.mjs';

export const id = 'history-exam';
export const method = 'crawl';
export const groupId = 'history-exam';

/** 이 헤더가 사라지면 사이트가 개편된 것이다. 조용히 다른 표를 읽지 않고 실패한다. */
export const EXPECT_HEADERS = ['구분', '원서접수', '취소좌석 접수', '시험일시', '합격자발표'];

/**
 * 표 → Session[]. 네트워크를 타지 않으므로 저장된 HTML 로도 테스트할 수 있다.
 *
 * @param {string} html
 * @param {{year:number}} ctx
 * @returns {{sessions:object[], diagnostics:{rows:number, parsed:number, failures:object[]}}}
 */
export function parse(html, { year }) {
  const picked = tableByHeader(readTables(html), EXPECT_HEADERS);
  if (!picked) {
    return { sessions: [], diagnostics: { rows: 0, parsed: 0, headerMatch: false, failures: [] } };
  }

  const rows = rowsAsObjects(picked).filter(r => /제\s*\d+\s*회/.test(r['구분']));
  const sessions = [];
  const failures = [];

  for (const row of rows) {
    const seq = Number(row['구분'].match(/제\s*(\d+)\s*회/)?.[1]);
    if (!Number.isFinite(seq)) continue;

    const events = [];
    const add = (kind, text, label, evSeq = 1) => {
      const res = tryParseRange(text, { year, requireYear: true });
      if (!res.ok) {
        // 미정은 정상이다. 그 외는 파싱 실패로 집계해 드리프트에 반영한다.
        if (res.reason !== 'tbd') failures.push({ seq, label, reason: res.reason, raw: res.raw });
        return;
      }
      events.push({
        kind,
        phase: 'single',
        start: res.value.start,
        end: res.value.end,
        seq: evSeq,
        label,
        note: evSeq > 1 ? '취소좌석접수' : null,
      });
    };

    add('reg', row['원서접수'], '원서접수', 1);
    add('reg', row['취소좌석 접수'], '취소좌석 접수', 2);
    add('exam', row['시험일시'], '시험');
    add('result', row['합격자발표'], '합격자발표');

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

  sessions.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  return {
    sessions,
    diagnostics: { rows: rows.length, parsed: sessions.length, headerMatch: true, failures },
  };
}
