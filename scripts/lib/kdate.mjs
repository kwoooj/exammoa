// 한국 시험일정 표기 파서. 의존성 없음.
//
// 기관마다 표기가 다르다. 실측된 형태:
//   2026.08.09 · 2026-08-19 · 20260809
//   2026년 1월 6일(화) 10:00 ~ 2026년 1월 13일(화) 17:00
//   01.26.(월) ~ 02.06.(금)      ← 연도 없음. 제목에서 상속해야 한다
//   3.3~9                        ← 끝 항의 월 생략
//   12.28~1.5                    ← 연도가 넘어간다
//
// 계약: **절대 날짜를 만들어내지 않는다.** 모르면 null 이다. 추측한 날짜를 내보내면
// 사용자가 접수를 놓친다. 실패 사유는 tryParseRange 로 확인한다.

/** 미정 표기. 이런 값에 날짜를 부여하면 안 된다. */
const TBD = /^(미정|추후\s*공지|별도\s*공고|추후공지|미공고|-|–|—|·|‧|\.|없음|N\/A)?$/i;

/** 시각. 날짜 범위 구분자(~)와 혼동하지 않기 위해 먼저 떼어낸다. */
const TIME = /\s*(오전|오후)?\s*(\d{1,2}):(\d{2})(?::\d{2})?/g;

/** 기관 표기의 오전·오후 시각을 24시간제 HH:mm 으로 바꾼다. 추정은 하지 않는다. */
function clockOf(meridiem, hourText, minuteText) {
  let hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === '오전' && hour === 12) hour = 0;
    if (meridiem === '오후' && hour < 12) hour += 12;
  } else if (hour < 0 || hour > 23) return null;
  return `${pad(hour)}:${pad(minute)}`;
}

/** 문자열에서 첫 공식 시각을 읽는다. `09:00:00`처럼 초가 붙어도 분까지만 보존한다. */
export function parseClock(text) {
  const match = [...normalizeText(text).matchAll(TIME)][0];
  return match ? clockOf(match[1], match[2], match[3]) : null;
}

/**
 * 날짜 셀에 함께 적힌 공식 시각을 이벤트 메타데이터로 만든다.
 * 첫 시각은 시작, 둘째 시각은 종료다. 하나뿐이면 시작 시각만 확정한다.
 */
export function parseTiming(text) {
  const clocks = [...normalizeText(text).matchAll(TIME)]
    .map(m => clockOf(m[1], m[2], m[3]))
    .filter(Boolean);
  if (!clocks.length) return null;
  return {
    start: clocks[0],
    ...(clocks[1] ? { end: clocks[1] } : {}),
    timezone: 'Asia/Seoul',
    status: 'confirmed',
  };
}

export function normalizeText(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;| /g, ' ')
    .replace(/&amp;/g, '&')
    // 전각 숫자·마침표·물결표를 반각으로
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[．｡。]/g, '.')
    .replace(/[～〜]/g, '~')
    .replace(/[–—]/g, '-')
    .replace(/[ \t\r\n]+/g, ' ')
    .trim();
}

/** '2026년도 시행일정' → 2026 */
export function yearFromHeading(text) {
  const m = normalizeText(text).match(/\b(20[2-9]\d)\s*(년|학년도)?/);
  return m ? Number(m[1]) : null;
}

const pad = (n) => String(n).padStart(2, '0');

/**
 * 존재하는 날짜인지 직접 검산한다.
 * `new Date(2026, 1, 29)` 는 3월 1일로 굴러가므로 Date 에 맡기면 잘못된 날짜가 통과한다.
 */
export function isRealDate(y, m, d) {
  if (!(y >= 2000 && y <= 2099) || !(m >= 1 && m <= 12) || !(d >= 1)) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const len = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return d <= len;
}

const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

/** 날짜 한 조각. 연도·월이 없으면 null 로 남긴다 (호출부가 상속시킨다) */
function parsePiece(s) {
  const t = s.trim();

  // 20260809
  let m = t.match(/(?<!\d)(20[2-9]\d)(\d{2})(\d{2})(?!\d)/);
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };

  // 2026년 1월 6일 / 2026.1.6 / 2026-01-06 / 2026/1/6
  m = t.match(/(20[2-9]\d)\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };

  // '26.01.26
  m = t.match(/'(\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/);
  if (m) return { y: 2000 + +m[1], m: +m[2], d: +m[3] };

  // 1월 6일 / 01.26 / 1.6 — 연도 없음
  m = t.match(/(?<![\d.])(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (m) return { y: null, m: +m[1], d: +m[2] };

  // 9  (범위 끝에서 월이 생략된 경우: 3.3~9)
  m = t.match(/^(\d{1,2})\s*일?$/);
  if (m) return { y: null, m: null, d: +m[1] };

  return null;
}

/**
 * @param {string} text
 * @param {{year?: number, requireYear?: boolean}} ctx
 * @returns {{ok:true, value:{start:string,end:string,crossedYear:boolean,hadYear:boolean}}
 *          |{ok:false, reason:'tbd'|'no-match'|'invalid-date'|'inconsistent'|'year-required', raw:string}}
 */
export function tryParseRange(text, ctx = {}) {
  const raw = normalizeText(text);
  if (TBD.test(raw)) return { ok: false, reason: 'tbd', raw };

  // 시각을 떼어낸다. '10:00 ~ 17:00' 을 날짜 범위로 오인하지 않기 위해서다.
  const noTime = raw.replace(TIME, ' ');
  // 요일 괄호도 떼어낸다
  const clean = noTime.replace(/\(\s*[월화수목금토일]\s*\)/g, ' ').replace(/\s+/g, ' ').trim();

  const parts = clean.split(/\s*~\s*/).map(s => s.trim()).filter(Boolean);
  if (!parts.length) return { ok: false, reason: 'no-match', raw };

  const a = parsePiece(parts[0]);
  if (!a || a.m == null) return { ok: false, reason: 'no-match', raw };

  const hadYear = a.y != null;
  if (!hadYear && ctx.requireYear) return { ok: false, reason: 'year-required', raw };
  const baseYear = a.y ?? ctx.year;
  if (baseYear == null) return { ok: false, reason: 'year-required', raw };
  if (!isRealDate(baseYear, a.m, a.d)) return { ok: false, reason: 'invalid-date', raw };

  const start = iso(baseYear, a.m, a.d);
  if (parts.length === 1) {
    return { ok: true, value: { start, end: start, crossedYear: false, hadYear } };
  }

  const b = parsePiece(parts[1]);
  if (!b) return { ok: false, reason: 'no-match', raw };

  // 끝 항에 월이 없으면 시작 월을 상속한다 (3.3~9)
  const endMonth = b.m ?? a.m;
  // 끝 월이 시작보다 작으면 연도가 넘어간 것이다 (12.28~1.5)
  let endYear = b.y ?? baseYear;
  const crossedYear = b.y == null && endMonth < a.m;
  if (crossedYear) endYear = baseYear + 1;

  if (!isRealDate(endYear, endMonth, b.d)) return { ok: false, reason: 'invalid-date', raw };
  const end = iso(endYear, endMonth, b.d);
  if (end < start) return { ok: false, reason: 'inconsistent', raw };

  return { ok: true, value: { start, end, crossedYear, hadYear } };
}

/** 성공하면 {start, end}, 실패하면 null. 사유가 필요하면 tryParseRange 를 쓴다. */
export function parseRange(text, ctx = {}) {
  const r = tryParseRange(text, ctx);
  return r.ok ? { start: r.value.start, end: r.value.end } : null;
}

/** 단일 날짜. 범위가 오면 시작일만 쓴다. */
export function parseDate(text, ctx = {}) {
  return parseRange(text, ctx)?.start ?? null;
}

/** 셀 하나에 줄바꿈으로 구간이 여럿 들어있는 경우 */
export function parseCell(text, ctx = {}) {
  return String(text ?? '')
    .split(/<br\s*\/?>|\n/i)
    .map(s => tryParseRange(s, ctx))
    .filter(r => r.ok)
    .map(r => r.value);
}
