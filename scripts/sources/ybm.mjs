// YBM 어댑터 — TOEIC 과 TOEIC Speaking.
//
// 계획 문서는 "토익 파서로 토익스피킹이 공짜" 라고 적었는데 **틀렸다.** 실측하니 표 구조가
// 다르다.
//
//   TOEIC          회차 | 시험일시 | 성적발표일시 | 접수기간      12행
//   TOEIC Speaking       시험일시 | 성적발표일   | 접수기간      56행
//
// 차이 세 가지를 설정으로 흡수한다.
//   ① 토스에는 회차 컬럼이 없다 → 시험일 순서로 회차를 만든다
//   ② 토익의 접수기간 한 칸에 '정기접수' 와 '특별추가' 가 함께 들어있다 → reg seq 1·2
//   ③ 토스는 같은 시험일이 여러 행에 중복된다 (지역·시간대) → 시험일로 중복 제거

import { tryParseRange } from '../lib/kdate.mjs';
import { readTables, rowsAsObjects, tableByHeader } from '../lib/html.mjs';

export const method = 'crawl';

/** 접수기간 칸을 정기/특별추가로 나눈다. <br> 이 공백으로 접히므로 라벨로 자른다. */
export function splitReg(text) {
  const s = String(text ?? '');
  const grab = (label, next) => {
    const i = s.indexOf(label);
    if (i < 0) return null;
    const from = i + label.length;
    const to = next ? (s.indexOf(next, from) < 0 ? s.length : s.indexOf(next, from)) : s.length;
    return s.slice(from, to).replace(/^\s*[:：]\s*/, '').trim();
  };
  const regular = grab('정기접수', '특별추가');
  const extra = grab('특별추가', null);
  // 라벨이 없으면 칸 전체가 하나의 접수기간이다 (토스)
  if (regular == null && extra == null) return [{ text: s, label: '원서접수', seq: 1 }];
  return [
    regular != null ? { text: regular, label: '원서접수', seq: 1 } : null,
    extra != null ? { text: extra, label: '특별추가접수', seq: 2 } : null,
  ].filter(Boolean);
}

/**
 * @param {string} html
 * @param {{year:number}} ctx
 * @param {{id:string, groupId:string, headers:string[], seqColumn?:string,
 *          examColumn:string, resultColumn:string, regColumn:string}} conf
 */
export function parseWith(html, { year }, conf) {
  const picked = tableByHeader(readTables(html), conf.headers);
  if (!picked) {
    return { sessions: [], diagnostics: { rows: 0, parsed: 0, headerMatch: false, failures: [] } };
  }

  const rows = rowsAsObjects(picked);
  const failures = [];
  /** 시험일 → session. 같은 시험일이 여러 행에 나오면 한 회차로 본다 */
  const byExamDate = new Map();

  for (const row of rows) {
    const examRes = tryParseRange(row[conf.examColumn], { year, requireYear: true });
    if (!examRes.ok) {
      if (examRes.reason !== 'tbd' && examRes.reason !== 'no-match') {
        failures.push({ label: '시험일시', reason: examRes.reason, raw: examRes.raw });
      }
      continue;
    }
    const examDate = examRes.value.start;
    if (byExamDate.has(examDate)) continue; // 중복 행

    const events = [{
      kind: 'exam', phase: 'single', start: examDate, end: examDate, seq: 1, label: '시험', note: null,
    }];

    for (const part of splitReg(row[conf.regColumn])) {
      const r = tryParseRange(part.text, { year, requireYear: true });
      if (!r.ok) {
        if (r.reason !== 'tbd') failures.push({ label: part.label, reason: r.reason, raw: r.raw });
        continue;
      }
      events.push({
        kind: 'reg', phase: 'single', start: r.value.start, end: r.value.end,
        seq: part.seq, label: part.label, note: part.seq > 1 ? '특별추가접수' : null,
      });
    }

    const res = tryParseRange(row[conf.resultColumn], { year, requireYear: true });
    if (res.ok) {
      events.push({
        kind: 'result', phase: 'single', start: res.value.start, end: res.value.start,
        seq: 1, label: '성적발표', note: null,
      });
    } else if (res.reason !== 'tbd' && res.reason !== 'no-match') {
      failures.push({ label: '성적발표', reason: res.reason, raw: res.raw });
    }

    // 회차 번호는 있으면 쓰고, 없으면 아래에서 시험일 순서로 매긴다
    const declared = conf.seqColumn
      ? Number(String(row[conf.seqColumn] ?? '').match(/제?\s*(\d+)\s*회/)?.[1])
      : NaN;

    events.sort((a, b) => a.start.localeCompare(b.start) || a.seq - b.seq);
    byExamDate.set(examDate, { declaredSeq: Number.isFinite(declared) ? declared : null, events });
  }

  const ordered = [...byExamDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const sessions = ordered.map(([examDate, v], i) => {
    const seq = v.declaredSeq ?? i + 1;
    return {
      id: `${conf.groupId}-${year}-${seq}`,
      groupId: conf.groupId,
      year,
      seq,
      label: v.declaredSeq ? `제${seq}회` : `${examDate.slice(5).replace('-', '.')} 시행`,
      mode: 'scheduled',
      status: 'confirmed',
      events: v.events,
    };
  });

  return {
    sessions,
    diagnostics: { rows: rows.length, parsed: sessions.length, headerMatch: true, failures },
  };
}

// ---- TOEIC -------------------------------------------------------------

export const toeic = {
  id: 'toeic',
  method,
  groupId: 'toeic',
  EXPECT_HEADERS: ['회차', '시험일시', '성적발표일시', '접수기간'],
  parse(html, ctx) {
    return parseWith(html, ctx, {
      groupId: 'toeic',
      headers: this.EXPECT_HEADERS,
      seqColumn: '회차',
      examColumn: '시험일시',
      resultColumn: '성적발표일시',
      regColumn: '접수기간',
    });
  },
};

// ---- TOEIC Speaking ----------------------------------------------------

export const toeicSpeaking = {
  id: 'toeic-speaking',
  method,
  groupId: 'toeic-speaking',
  // 회차 컬럼이 없다. 시험일 순서로 회차를 만든다.
  EXPECT_HEADERS: ['시험일시', '성적발표일', '접수기간'],
  parse(html, ctx) {
    return parseWith(html, ctx, {
      groupId: 'toeic-speaking',
      headers: this.EXPECT_HEADERS,
      examColumn: '시험일시',
      resultColumn: '성적발표일',
      regColumn: '접수기간',
    });
  },
};
