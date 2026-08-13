// CSV 읽기. 의존성 없음.
//
// 실측한 함정 두 개를 처리하려고 있는 파일이다.
//
//   ① 공공데이터포털 CSV 는 EUC-KR 이다. readFile(path, 'utf8') 로 읽으면 헤더가
//      `����,�����,���豸��` 로 나온다. Node 24 는 full ICU 를 품고 있어서
//      TextDecoder('euc-kr') 이 그냥 동작한다 — 인코딩 라이브러리가 필요 없다.
//
//   ② 따옴표 안에 콤마가 있다. `"제1회 SQLD : (서울)○○대학교, 경영관 3층"` 처럼.
//      split(',') 로 쪼개면 컬럼이 밀려서 마지막 칸(시험유형)에 ` 4층"` 같은 값이
//      들어오고, 그게 조용히 통과한다. 그래서 정규식이 아니라 상태 기계로 읽는다.

import { readFile } from 'node:fs/promises';

/**
 * RFC 4180. 따옴표 안의 콤마·줄바꿈·이중따옴표(`""`)를 처리한다.
 *
 * @param {string} text
 * @returns {string[][]} 빈 줄은 버린다
 */
export function parseCsv(text) {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // BOM
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  const endField = () => { row.push(field); field = ''; };
  const endRow = () => {
    endField();
    // 빈 줄(칸 하나에 빈 문자열)은 행으로 세지 않는다
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; continue; }
        quoted = false;
        continue;
      }
      field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { endField(); continue; }
    if (c === '\r') continue;            // CRLF
    if (c === '\n') { endRow(); continue; }
    field += c;
  }
  if (field !== '' || row.length) endRow();
  return rows;
}

/**
 * 인코딩을 추정해 디코드한다.
 *
 * UTF-8 로 먼저 시도하고, 실패하거나 **결과가 읽을 수 없으면** EUC-KR 로 본다.
 * 바이트 판별만으로는 부족하다 — EUC-KR 바이트가 우연히 유효한 UTF-8 인 경우가 있고,
 * 그때 조용히 깨진 문자열이 나온다. 그래서 `expect` 문자열이 보이는지까지 확인한다.
 *
 * @param {Buffer|Uint8Array} buf
 * @param {string} expect 헤더에 반드시 있어야 하는 문자열
 */
export function decodeKorean(buf, expect = '') {
  const tryDecode = (enc, fatal) => {
    try {
      const text = new TextDecoder(enc, { fatal }).decode(buf);
      if (expect && !text.slice(0, 4096).includes(expect)) return null;
      return text;
    } catch {
      return null;
    }
  };
  return tryDecode('utf-8', true)
    ?? tryDecode('euc-kr', false)
    // 둘 다 `expect` 를 못 찾았으면 파일이 바뀐 것이다. 호출부가 헤더 검사로 실패시킨다.
    ?? new TextDecoder('utf-8').decode(buf);
}

/**
 * 파일 → 객체 배열. 첫 줄을 헤더로 쓴다.
 *
 * 칸 수가 헤더와 다른 행은 **버리지 않고 세어서 돌려준다.** 파서가 틀렸다는 신호이므로
 * 조용히 사라지면 안 된다.
 *
 * @returns {{header:string[], rows:object[], malformed:number}}
 */
export async function readCsv(path, { expect = '' } = {}) {
  const text = decodeKorean(await readFile(path), expect);
  const table = parseCsv(text);
  if (!table.length) return { header: [], rows: [], malformed: 0 };

  const header = table[0].map(h => h.trim());
  const rows = [];
  let malformed = 0;
  for (const r of table.slice(1)) {
    if (r.length !== header.length) { malformed++; continue; }
    rows.push(Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
  }
  return { header, rows, malformed };
}
