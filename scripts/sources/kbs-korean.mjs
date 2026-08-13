// KBS한국어능력시험 (KBS) 어댑터.
//
// 실측 표가 가장 단순하다. 접수와 추가접수가 **별도 컬럼**이라 한 칸을 쪼갤 필요가 없다.
//
//   시험회차 | 접수기간 | 추가 접수기간 | 시험일시 | 성적발표일
//
// '추가 접수기간' 은 공단 빈자리접수·한능검 취소좌석접수와 같은 성격이라 reg seq 2 다.
// 정기접수 마감과 섞이면 D-Day 가 거짓이 된다.

import { tryParseRange } from '../lib/kdate.mjs';
import { readTables, rowsAsObjects, tableByHeader } from '../lib/html.mjs';

export const id = 'kbs-korean';
export const method = 'crawl';
export const groupId = 'kbs-korean';

export const EXPECT_HEADERS = ['시험회차', '접수기간', '추가 접수기간', '시험일시', '성적발표일'];

/**
 * 아카이브 해시에서 지울 휘발성 조각. 저장되는 바이트는 그대로다.
 *
 * 실측: 같은 날 122KB 스냅샷 3건이 쌓였고 두 파일의 차이가 **딱 한 군데**였다.
 *
 *   SERVER_NOW:"2026/08/13 16:12:42"
 *   SERVER_NOW:"2026/08/13 17:02:45"
 *
 * Nuxt SSR 페이로드(`window.__NUXT__`)에 서버 시각이 박혀 나온다. 같은 페이로드의
 * `D_DAY` 는 서버가 계산한 카운트다운이라 날이 바뀌면 반드시 달라진다 — 오늘 안에서는
 * 같았지만 하루 뒤에는 다르다. 둘 다 우리가 쓰는 값이 아니다.
 *
 * 일정 값(`EXAM_DT`·`APPLY_START_DT`·`GRADE_NOTICE_DATE`)은 절대 지우지 말 것.
 * 그게 바뀌었을 때 스냅샷이 남는 것이 이 아카이브의 유일한 용도다.
 */
export const volatile = [
  /SERVER_NOW:"[^"]*"/g,
  /D_DAY:-?\d+/g,
];

export function parse(html, { year }) {
  const picked = tableByHeader(readTables(html), EXPECT_HEADERS);
  if (!picked) {
    return { sessions: [], diagnostics: { rows: 0, parsed: 0, headerMatch: false, failures: [] } };
  }

  const rows = rowsAsObjects(picked).filter(r => /제\s*\d+\s*회/.test(r['시험회차']));
  const sessions = [];
  const failures = [];

  for (const row of rows) {
    const seq = Number(row['시험회차'].match(/제\s*(\d+)\s*회/)?.[1]);
    if (!Number.isFinite(seq)) continue;

    const events = [];
    const add = (kind, text, label, evSeq = 1, note = null) => {
      const res = tryParseRange(text, { year, requireYear: true });
      if (!res.ok) {
        if (res.reason !== 'tbd') failures.push({ seq, label, reason: res.reason, raw: res.raw });
        return;
      }
      const end = kind === 'result' ? res.value.start : res.value.end;
      events.push({ kind, phase: 'single', start: res.value.start, end, seq: evSeq, label, note });
    };

    add('reg', row['접수기간'], '원서접수', 1);
    add('reg', row['추가 접수기간'], '추가접수', 2, '추가접수');
    add('exam', row['시험일시'], '시험');
    add('result', row['성적발표일'], '성적발표');

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
