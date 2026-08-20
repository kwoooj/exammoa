// 전산세무회계 (한국세무사회) 어댑터.
//
// ---- 인코딩 -----------------------------------------------------------
//
// 이 페이지는 **EUC-KR** 이다. `Content-Type: text/html; charset=euc-kr` 로 선언까지
// 하는데, `Response.text()` 는 Fetch 명세상 그 선언을 무시하고 언제나 UTF-8 로
// 디코드한다. 그대로 읽으면 표 헤더가 깨져 `tableByHeader()` 가 아무것도 못 찾는다.
// `lib/csv.mjs` 의 `decodeResponse()` 를 거쳐야 한다.
//
// ---- 표 구조 ----------------------------------------------------------
//
//   원서접수 | 장소공고 수험표출력 | 시험일자 | 발표
//   01.02 ∼ 01.08 | 01.26 ∼ 01.31 | 01.31(토) | 02.26(목)
//
// 구분자가 `~` 가 아니라 **`∼`(U+223C)** 다. 연 6회.
//
// `장소공고 수험표출력` 은 이벤트로 만들지 않는다. `EventKind` 는 `reg|exam|result`
// 뿐이고, 수험표 출력 기간은 그 어느 것도 아니다. 억지로 `reg seq 2` 에 넣으면
// 추가접수와 구분이 안 돼 D-Day 가 거짓이 된다 (한능검 취소좌석접수와 성격이 다르다).
//
// ---- 회차 번호를 쓰지 않는 이유 -----------------------------------------
//
// 표에 회차 칸이 없다. 페이지 어딘가에 `제127회` 가 있긴 한데 **공지 배너 안**이고
// 표의 행과 묶여 있지 않다. 배너의 날짜로 역산해 번호를 매길 수는 있지만, 그 배너는
// 해당 기간에만 뜬다 — 배너가 사라지는 날 회차 번호가 바뀌고 `sessionId` 가 흔들려
// 사용자가 저장한 계획과 공유된 `?p=` 링크가 깨진다 (규칙 2).
//
// 그래서 **연내 순번을 seq 로 쓰고 라벨은 시험일로 붙인다** (`08.01 시행`).
// 토익스피킹과 같은 처리다. 번호를 지어내는 것보다 날짜가 정확하다.

import { tryParseRange } from '../lib/kdate.mjs';
import { readTables, rowsAsObjects, tableByHeader } from '../lib/html.mjs';
import { sourceCoverage } from '../lib/source-coverage.mjs';

export const id = 'kacpta-tax';
export const method = 'crawl';
// 같은 날짜라도 시험시간이 다르면 같은 시행그룹이 아니다. 첫 그룹은 collect.mjs가
// sourceUrl을 찾는 대표 그룹이고, 파서는 아래 10개 그룹의 세션을 모두 반환한다.
export const groupId = 'kacpta-computer-tax-1';

export const TAX_EXAMS = [
  { slug: '전산세무1급', groupId: 'kacpta-computer-tax-1', name: '전산세무 1급', start: '15:00', end: '16:30' },
  { slug: '전산세무2급', groupId: 'kacpta-computer-tax-2', name: '전산세무 2급', start: '12:30', end: '14:00' },
  { slug: '전산회계1급', groupId: 'kacpta-computer-accounting-1', name: '전산회계 1급', start: '15:00', end: '16:00' },
  { slug: '전산회계2급', groupId: 'kacpta-computer-accounting-2', name: '전산회계 2급', start: '12:30', end: '13:30' },
  { slug: '세무회계1급', groupId: 'kacpta-tax-accounting-1', name: '세무회계 1급', start: '09:30', end: '11:10' },
  { slug: '세무회계2급', groupId: 'kacpta-tax-accounting-2', name: '세무회계 2급', start: '09:30', end: '10:50' },
  { slug: '세무회계3급', groupId: 'kacpta-tax-accounting-3', name: '세무회계 3급', start: '09:30', end: '10:30' },
  { slug: '기업회계1급', groupId: 'kacpta-corporate-accounting-1', name: '기업회계 1급', start: '09:30', end: '11:10' },
  { slug: '기업회계2급', groupId: 'kacpta-corporate-accounting-2', name: '기업회계 2급', start: '09:30', end: '10:50' },
  { slug: '기업회계3급', groupId: 'kacpta-corporate-accounting-3', name: '기업회계 3급', start: '09:30', end: '10:30' },
];

/** 이 헤더가 사라지면 사이트가 개편된 것이다. 16개 표 중 하나를 고르는 유일한 근거다. */
export const EXPECT_HEADERS = ['원서접수', '시험일자', '발표'];

/** 표기가 `∼`(U+223C)·`〜`·`~` 로 갈린다. 파서가 아는 형태로 맞춘다. */
export function normalizeTilde(text) {
  return String(text ?? '').replace(/[∼〜～]/g, '~');
}

export function parse(html, { year }) {
  const picked = tableByHeader(readTables(html), EXPECT_HEADERS);
  if (!picked) {
    return { sessions: [], diagnostics: { rows: 0, parsed: 0, headerMatch: false, failures: [] } };
  }

  const rows = rowsAsObjects(picked);
  const failures = [];
  const sessions = [];

  for (const row of rows) {
    const examRes = tryParseRange(normalizeTilde(row['시험일자']), { year, requireYear: false });
    if (!examRes.ok) {
      // 표의 빈 행(위·아래 여백)은 실패가 아니다
      if (examRes.reason !== 'tbd' && examRes.reason !== 'no-match') {
        failures.push({ label: '시험일자', reason: examRes.reason, raw: examRes.raw });
      }
      continue;
    }

    const events = [{
      kind: 'exam', phase: 'single', start: examRes.value.start, end: examRes.value.end,
      seq: 1, label: '시험', note: null,
    }];

    const reg = tryParseRange(normalizeTilde(row['원서접수']), { year, requireYear: false });
    if (reg.ok) {
      events.push({
        kind: 'reg', phase: 'single', start: reg.value.start, end: reg.value.end,
        seq: 1, label: '원서접수', note: null,
      });
    } else if (reg.reason !== 'tbd' && reg.reason !== 'no-match') {
      failures.push({ label: '원서접수', reason: reg.reason, raw: reg.raw });
    }

    const result = tryParseRange(normalizeTilde(row['발표']), { year, requireYear: false });
    if (result.ok) {
      events.push({
        kind: 'result', phase: 'single', start: result.value.start, end: result.value.start,
        seq: 1, label: '합격자발표', note: null,
      });
    } else if (result.reason !== 'tbd' && result.reason !== 'no-match') {
      failures.push({ label: '발표', reason: result.reason, raw: result.raw });
    }

    events.sort((a, b) => a.start.localeCompare(b.start) || a.seq - b.seq);
    sessions.push({ examDate: examRes.value.start, events });
  }

  // 시험일 순서로 연내 순번을 매긴다. 회차 번호를 지어내지 않는다.
  sessions.sort((a, b) => a.examDate.localeCompare(b.examDate));
  const out = TAX_EXAMS.flatMap(target => sessions.map((s, i) => ({
    id: `${target.groupId}-${year}-${i + 1}`,
    groupId: target.groupId,
    year,
    seq: i + 1,
    label: `${s.examDate.slice(5).replace('-', '.')} 시행`,
    mode: 'scheduled',
    status: 'confirmed',
    events: s.events.map(event => event.kind === 'exam'
      ? {
          ...event,
          timing: {
            start: target.start,
            end: target.end,
            timezone: 'Asia/Seoul',
            status: 'confirmed',
          },
        }
      : { ...event }),
  })));
  out.sort((a, b) => a.groupId.localeCompare(b.groupId) || a.seq - b.seq);

  return {
    sessions: out,
    diagnostics: {
      rows: rows.length,
      parsed: out.length,
      headerMatch: true,
      timingMatch: TAX_EXAMS.every(target => target.start && target.end),
      coverage: sourceCoverage({
        discovered: TAX_EXAMS.map(target => target.groupId),
        included: TAX_EXAMS.map(target => target.groupId),
        expected: TAX_EXAMS.map(target => target.groupId),
      }),
      failures,
    },
  };
}
