// 한국데이터산업진흥원 (dataq) 어댑터 — 공공데이터포털 파일데이터 15062838.
//
// 크롤링하지 않는 이유: dataq.or.kr 은 robots.txt 가 `Disallow: /` 다. 일정표가 완전한
// SSR 이라 기술적으로는 가능하지만 하지 않는다.
//
// 자동 다운로드도 하지 않는다. **갱신주기가 연간**이라(차기등록예정일 2027-01-22) 매일
// 받아 봐야 같은 파일이다. 연 1회 사람이 내려받아 `data/dataq-{year}.csv` 로 커밋한다.
// 그래서 이 소스는 네트워크를 타지 않는다.
//
// ---- 실측 함정 --------------------------------------------------------
//
// **시험명 표기가 연도에 따라 바뀐다.**
//
//   옛: SQLD(국가공인 SQL 개발자)     새: SQL 개발자(SQLD)
//   옛: 국가기술 빅데이터분석기사      새: 빅데이터분석기사-필기 / -실기
//
// 이름으로 매핑할 수밖에 없으므로 **매핑에 없는 이름은 조용히 버리지 않고 실패로
// 집계한다.** 표기가 또 바뀌면 종목이 사라지는 게 아니라 빨간불이 켜져야 한다.
//
// **빅분기는 필기와 실기가 별도 행인데 회차 번호가 같다.** 12회 필기(4/4)와 12회
// 실기(6/20)를 한 Session 으로 합치고 phase 를 나눈다 — Q-Net 정처기와 같은 모델이다.
// 접수 기간도 각각 따로 있다.

import { readCsv } from '../lib/csv.mjs';
import { parseClock } from '../lib/kdate.mjs';
import { coverageProblem, sourceCoverage } from '../lib/source-coverage.mjs';

export const id = 'dataq-csv';
export const method = 'csv';

/** 이 헤더가 바뀌면 파일 형식이 바뀐 것이다. 조용히 다른 칸을 읽지 않는다. */
export const EXPECT_HEADERS = [
  '순번', '시험명', '시험구분', '회차', '시험일', '시험시작시간',
  '접수시작일', '접수마감일', '시험장소', '합격자발표일', '시험유형',
];

/**
 * 시험명 → 그룹. 표기가 여러 개라 전부 선언한다.
 *
 * 공식 CSV의 7개 자격군을 전부 선언한다. 여기 없는 이름은 새 자격이나 표기 변경이므로
 * 소스를 실패시킨다. `OUT_OF_SCOPE` 같은 무음 제외 목록은 두지 않는다.
 */
export const NAME_MAP = new Map([
  ['데이터분석 준전문가(ADsP)', 'kdata-adsp'],
  ['ADsP(국가공인 데이터분석 준전문가)', 'kdata-adsp'],
  ['SQL 개발자(SQLD)', 'kdata-sqld'],
  ['SQLD(국가공인 SQL 개발자)', 'kdata-sqld'],
  ['빅데이터분석기사-필기', 'kdata-bigdata'],
  ['빅데이터분석기사-실기', 'kdata-bigdata'],
  ['국가기술 빅데이터분석기사', 'kdata-bigdata'],
  ['데이터분석 전문가(ADP)-필기', 'kdata-adp'],
  ['데이터 분석 전문가(ADP)-실기', 'kdata-adp'],
  ['데이터분석 전문가(ADP)', 'kdata-adp'],
  ['SQL 전문가(SQLP)', 'kdata-sqlp'],
  ['SQLP(국가공인 SQL 전문가)', 'kdata-sqlp'],
  ['데이터아키텍처 전문가(DAP)', 'kdata-dap'],
  ['DAP(국가공인 데이터아키텍처 전문가)', 'kdata-dap'],
  ['데이터아키텍처 준전문가(DAsP)', 'kdata-dasp'],
  ['DAsP(국가공인 데이터아키텍처 준전문가)', 'kdata-dasp'],
]);

/** 이 그룹들이 하나라도 비면 소스 실패다. 시드가 가리키는 그룹이기 때문이다. */
export const REQUIRED_GROUPS = [
  'kdata-adp', 'kdata-adsp', 'kdata-bigdata', 'kdata-dap', 'kdata-dasp', 'kdata-sqld', 'kdata-sqlp',
];

/** 필기·실기가 별도 행인 그룹. 같은 회차를 한 Session 으로 합친다. */
const TWO_PHASE = new Set(['kdata-adp', 'kdata-bigdata']);

const isIso = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '').trim());

/** `12회` · `12` → 12 */
function seqOf(v) {
  const n = Number(String(v ?? '').match(/(\d+)/)?.[1]);
  return Number.isFinite(n) ? n : null;
}

/** 시험유형 → phase. 두 단계 그룹만 필기·실기를 가른다. */
function phaseOf(type, groupId) {
  if (!TWO_PHASE.has(groupId)) return 'single';
  if (String(type).includes('실기')) return 'practical';
  return 'written';
}

const LABEL = {
  written: { reg: '필기 원서접수', exam: '필기시험', result: '필기 합격발표' },
  practical: { reg: '실기 원서접수', exam: '실기시험', result: '최종 합격발표' },
  single: { reg: '원서접수', exam: '시험', result: '합격자발표' },
};

/**
 * 행 → 이벤트. 날짜가 ISO 가 아니면 **만들지 않는다.**
 * CSV 는 이미 `YYYY-MM-DD` 로 오므로 파싱이 필요 없고, 그래서 형식이 어긋나면 곧 오류다.
 */
function eventsOf(row, phase, failures) {
  const out = [];
  const L = LABEL[phase];
  const regStart = row['접수시작일'];
  const regEnd = row['접수마감일'];
  const examDt = row['시험일'];
  const examClock = parseClock(row['시험시작시간']);
  const resultDt = row['합격자발표일'];

  const bad = (label, value, reason = '날짜 형식 아님') => failures.push({
    name: row['시험명'], seq: row['회차'], label, reason, raw: value,
  });

  if (isIso(regStart) && isIso(regEnd)) out.push({
    kind: 'reg', phase, start: regStart, end: regEnd, seq: 1, label: L.reg, note: null,
  });
  else if (regStart || regEnd) bad(L.reg, `${regStart} ~ ${regEnd}`);

  if (isIso(examDt)) out.push({
    kind: 'exam', phase, start: examDt, end: examDt, seq: 1, label: L.exam, note: null,
    ...(examClock ? { timing: { start: examClock, timezone: 'Asia/Seoul', status: 'confirmed' } } : {}),
  });
  else if (examDt) bad(L.exam, examDt);

  if (row['시험시작시간'] && !examClock) bad(`${L.exam} 시작시간`, row['시험시작시간'], '시각 형식 아님');

  if (isIso(resultDt)) out.push({
    kind: 'result', phase, start: resultDt, end: resultDt, seq: 1, label: L.result, note: null,
  });
  else if (resultDt) bad(L.result, resultDt);

  return out;
}

/**
 * 표 → Session[]. 파일을 읽지 않으므로 저장된 행 배열로도 테스트할 수 있다.
 *
 * @param {object[]} rows  readCsv 가 만든 객체 배열
 * @param {{year:number}} ctx
 */
export function parseRows(rows, { year }) {
  const failures = [];
  const discovered = [];
  const included = [];
  /** `groupId|seq` → session */
  const byKey = new Map();

  for (const row of rows) {
    // 해당 연도만. 947행이 2006~2026 을 담고 있다.
    if (!String(row['시험일'] ?? '').startsWith(String(year))) continue;

    const name = row['시험명'];
    const groupId = NAME_MAP.get(name);
    discovered.push(groupId ?? `unknown:${name}`);
    if (!groupId) {
      // 표기가 바뀐 것이다. 조용히 버리면 종목이 사라진다.
      failures.push({ name, seq: row['회차'], label: '시험명', reason: '매핑에 없는 시험명' });
      continue;
    }
    included.push(groupId);

    const seq = seqOf(row['회차']);
    if (seq == null) {
      failures.push({ name, seq: row['회차'], label: '회차', reason: '회차를 읽을 수 없다' });
      continue;
    }

    const phase = phaseOf(row['시험유형'], groupId);
    const events = eventsOf(row, phase, failures);
    if (!events.length) continue;

    // 특별검정·전환검정은 정기 회차와 섞으면 안 된다. note 로 남긴다.
    const kind = row['시험구분'];
    const note = kind && kind !== '일반검정' ? kind : null;
    if (note) for (const e of events) e.note = note;

    const key = `${groupId}|${seq}`;
    const existing = byKey.get(key);
    if (existing) {
      // 빅분기 필기 행 + 실기 행 → 한 회차
      existing.events.push(...events);
      continue;
    }
    byKey.set(key, {
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

  const sessions = [...byKey.values()];
  for (const s of sessions) {
    s.events.sort((a, b) => a.start.localeCompare(b.start) || a.seq - b.seq);
  }
  sessions.sort((a, b) => a.groupId.localeCompare(b.groupId) || (a.seq ?? 0) - (b.seq ?? 0));

  const groupsFound = new Set(sessions.map(s => s.groupId));
  const missing = REQUIRED_GROUPS.filter(g => !groupsFound.has(g));

  return {
    sessions,
    diagnostics: {
      rows: rows.length,
      parsed: sessions.length,
      headerMatch: true,
      missingGroups: missing,
      coverage: sourceCoverage({ discovered, included, expected: REQUIRED_GROUPS }),
      failures,
    },
  };
}

/**
 * 파일에서 읽는다. 네트워크를 타지 않는다.
 *
 * @param {{path:string, year:number, observedAt:string|null}} args
 */
export async function collectFile({ path, year, observedAt = null }) {
  const base = { id, method, ok: false, sessions: [], observedAt, error: null };
  let read;
  try {
    read = await readCsv(path, { expect: '시험명' });
  } catch (err) {
    return { ...base, error: `${path} 를 읽지 못했다 — ${err.message ?? err}` };
  }

  const missingHeaders = EXPECT_HEADERS.filter(h => !read.header.includes(h));
  if (missingHeaders.length) {
    // 헤더가 바뀌면 칸 위치를 짐작하지 않는다. 조용히 다른 칸을 읽는 것이 최악이다.
    return { ...base, error: `헤더 불일치 — 없는 칸: ${missingHeaders.join(', ')}` };
  }

  const { sessions, diagnostics } = parseRows(read.rows, { year });
  diagnostics.malformed = read.malformed;

  if (diagnostics.missingGroups.length) {
    return {
      ...base,
      sessions,
      diagnostics,
      error: `${year}년 일정이 없는 그룹 — ${diagnostics.missingGroups.join(', ')}`,
    };
  }
  const scopeProblem = coverageProblem(diagnostics.coverage);
  if (scopeProblem) {
    return { ...base, sessions, diagnostics, error: `공식 원본 전수 분류 실패 — ${scopeProblem}` };
  }
  if (read.malformed) {
    return { ...base, sessions, diagnostics, error: `칸 수가 안 맞는 행 ${read.malformed}건 — 파서를 확인하라` };
  }

  return { ...base, ok: true, sessions, diagnostics };
}
