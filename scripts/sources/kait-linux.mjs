// 리눅스마스터 (한국정보통신진흥협회) 어댑터.
//
// 계획서는 이 어댑터를 "연도 출처부터 정해야 한다" 며 막아 두었다. **표를 다시 읽으니
// 문제가 아니었다.** 페이지에 `2026` 이 한 번도 안 나오는 것은 맞지만, 회차 표기가
// 연도를 담고 있다.
//
//   2601회 → 2026년 1회      2604회 → 2026년 4회
//
// 앞 두 자리가 연도다. 추측이 아니라 표 안에 있는 값이므로 규칙 4(날짜를 추측해서
// 만들지 않는다)를 어기지 않는다. 다만 **수집 연도와 다르면 버린다** — 페이지에 작년
// 표가 남아 있을 수 있고, 그것을 올해 일정으로 게시하면 사용자가 접수를 놓친다.
//
// ---- 표 구조 ----------------------------------------------------------
//
//   종목 | 등급 | 회차 | 차수 | 접수일자 | 시험일자 | 합격자 발표
//
// **1급과 2급이 한 표에 섞여 있고 일정이 다르다.** 1급은 연 2회, 2급은 연 4회다.
// 그룹(`kait-linux`)이 2급만 담고 있으므로 등급으로 걸러낸다. 1급을 나중에 넣으려면
// 같은 그룹에 넣지 말 것 — 일정이 갈려 `foldGroups` 가 종료코드 1 을 낸다.
//
// **1차·2차가 별도 행이고 회차 번호가 같다.** 한 Session 으로 합친다 (빅분기와 같다).
// `phase` 는 written/practical 슬롯을 1차/2차로 쓴다. 라벨에 `1차`·`2차` 를 적어
// 필기/실기로 오해하지 않게 한다 — 2급 1차는 온라인, 2차는 필기다.
//
// **2급 1차 시험일자는 기간이다** (`01.27.(화) ~ 02.05.(목)`). 온라인 검정이라 그 안에서
// 응시일을 고른다. 정처기 CBT 와 같은 성격이다.
//
// **합격자 발표가 `시험종료 즉시` 인 행이 있다.** 날짜가 아니므로 이벤트를 만들지 않는다.

import { parseClock, parseTiming, tryParseRange } from '../lib/kdate.mjs';
import { readTables, rowsAsObjects, tableByHeader } from '../lib/html.mjs';

export const id = 'kait-linux';
export const method = 'crawl';
export const groupId = 'kait-linux';

/** 이 헤더가 사라지면 사이트가 개편된 것이다. 조용히 다른 표를 읽지 않는다. */
export const EXPECT_HEADERS = ['종목', '등급', '회차', '차수', '접수일자', '시험일자', '합격자 발표'];
export const EXPECT_TIME_CAPTION = '입실 및 시험시간';

/** 이 그룹이 담는 등급. 1급은 일정이 달라 같은 그룹에 넣으면 안 된다. */
export const GRADE = '2급';

/** `2601회` → `{ year: 2026, seq: 1 }`. 형식이 아니면 null */
export function parseRound(text) {
  const m = String(text ?? '').match(/(\d{2})\s*(\d{2})\s*회/);
  if (!m) return null;
  const yy = Number(m[1]);
  const seq = Number(m[2]);
  if (!Number.isFinite(yy) || !Number.isFinite(seq) || seq < 1) return null;
  return { year: 2000 + yy, seq };
}

/** 1차 → written 슬롯, 2차 → practical 슬롯. 라벨이 실제 의미를 말한다. */
function phaseOf(text) {
  const s = String(text ?? '');
  if (s.includes('2차')) return { phase: 'practical', stage: '2차' };
  if (s.includes('1차')) return { phase: 'written', stage: '1차' };
  return null;
}

/** 같은 공식 페이지 하단의 2급 1·2차 입실/시험시간 표를 읽는다. */
export function parseGrade2Timings(html) {
  const table = readTables(html).find(t => t.caption?.replace(/\s/g, '').includes(EXPECT_TIME_CAPTION.replace(/\s/g, '')));
  if (!table) return null;

  const out = {};
  for (const row of table.grid.slice(1)) {
    if (!row[0]?.text.includes('2급')) continue;
    const stage = row[1]?.text;
    const timing = parseTiming(row[3]?.text);
    if (!stage || !timing) continue;
    const admissionDeadline = parseClock(row[2]?.text);
    out[stage] = { ...timing, ...(admissionDeadline ? { admissionDeadline } : {}) };
  }
  return out['1차'] && out['2차'] ? out : null;
}

export function parse(html, { year }) {
  const picked = tableByHeader(readTables(html), EXPECT_HEADERS);
  if (!picked) {
    return { sessions: [], diagnostics: { rows: 0, parsed: 0, headerMatch: false, failures: [] } };
  }

  const rows = rowsAsObjects(picked);
  const grade2Timings = parseGrade2Timings(html);
  const failures = [];
  let otherGrade = 0;
  let otherYear = 0;
  /** seq → session */
  const bySeq = new Map();

  for (const row of rows) {
    // 등급 칸이 비어 있으면 표의 빈 행이다
    const grade = row['등급'];
    if (!grade) continue;
    if (!grade.includes(GRADE)) { otherGrade++; continue; }

    const round = parseRound(row['회차']);
    if (!round) {
      failures.push({ label: '회차', reason: '회차에서 연도를 읽을 수 없다', raw: row['회차'] });
      continue;
    }
    // 페이지에 작년 표가 남아 있을 수 있다. 올해 일정으로 게시하면 접수를 놓친다.
    if (round.year !== year) { otherYear++; continue; }

    const stage = phaseOf(row['차수']);
    if (!stage) {
      failures.push({ label: '차수', reason: '차수를 읽을 수 없다', raw: row['차수'] });
      continue;
    }

    const events = [];
    const add = (kind, text, label) => {
      const res = tryParseRange(text, { year: round.year, requireYear: false });
      if (!res.ok) {
        // `시험종료 즉시` 같은 값은 날짜가 아니다. 만들지 않고 조용히 넘긴다.
        if (res.reason !== 'tbd' && res.reason !== 'no-match') {
          failures.push({ seq: round.seq, label, reason: res.reason, raw: res.raw });
        }
        return;
      }
      const end = kind === 'result' ? res.value.start : res.value.end;
      let timing = null;
      if (kind === 'exam') {
        if (stage.phase === 'written' && res.value.start !== res.value.end) {
          timing = {
            timezone: 'Asia/Seoul',
            status: 'select-on-booking',
            note: '온라인 시험 기간 내 응시',
          };
        } else {
          timing = grade2Timings?.[stage.stage] ?? null;
        }
      }
      events.push({
        kind, phase: stage.phase, start: res.value.start, end,
        seq: 1, label: `${stage.stage} ${label}`, note: null,
        ...(timing ? { timing } : {}),
      });
    };

    add('reg', row['접수일자'], '원서접수');
    add('exam', row['시험일자'], '시험');
    add('result', row['합격자 발표'], '합격발표');
    if (!events.length) continue;

    const existing = bySeq.get(round.seq);
    if (existing) { existing.events.push(...events); continue; }
    bySeq.set(round.seq, {
      id: `${groupId}-${round.year}-${round.seq}`,
      groupId,
      year: round.year,
      seq: round.seq,
      label: `제${round.seq}회`,
      mode: 'scheduled',
      status: 'confirmed',
      events,
    });
  }

  const sessions = [...bySeq.values()];
  for (const s of sessions) s.events.sort((a, b) => a.start.localeCompare(b.start) || a.seq - b.seq);
  sessions.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

  return {
    sessions,
    diagnostics: {
      rows: rows.length,
      parsed: sessions.length,
      headerMatch: true,
      timingMatch: grade2Timings !== null,
      otherGrade,
      otherYear,
      failures,
    },
  };
}
