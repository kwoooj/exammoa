// 표 파서. 의존성 없음.
//
// 관용 파서(cheerio 등)를 넣지 않은 이유는 두 가지다. ① 크롤 허용 대상 4곳의 마크업이
// 전부 균형이 맞는다(<tr> 개폐 19/19·9/9·12/12·56/56). 깨진 마크업을 가진 곳은
// 정확히 robots.txt 가 금지한 사이트들이었다. ② 실제로 필요한 기능은 관대함이 아니라
// **rowspan 격자 복원**인데, 그건 어느 라이브러리를 써도 직접 써야 한다.
//
// 표를 인덱스나 CSS 클래스로 고르지 않는다. 그건 사이트 개편 시 조용히 다른 표를 읽는
// 1순위 원인이다. **헤더 텍스트로 고른다.** 그러면 일치하거나 크게 실패하고, 실패가
// 드리프트로 즉시 잡힌다.

import { normalizeText } from './kdate.mjs';

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null;
};

const num = (v, dflt = 1) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 100) : dflt;
};

/**
 * 표를 rowspan·colspan 이 펼쳐진 직사각 격자로 만든다.
 *
 * 리눅스마스터 표는 '리눅스마스터'·'2601회' 가 1차/2차 하위 행을 rowspan 으로 관통한다.
 * 펼치지 않으면 2차 행의 cells[0] 이 '1급' 이 아니라 '2차' 가 되어 열이 통째로 밀린다.
 */
export function readTables(html) {
  const source = String(html ?? '');
  return [...source.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map(m => {
    const table = m[0];
    const caption = table.match(/<caption[^>]*>([\s\S]*?)<\/caption>/i);
    const rows = [...table.matchAll(/<tr\b[\s\S]*?(?:<\/tr>|(?=<tr\b)|$)/gi)].map(r => r[0]);

    /** @type {({text:string, tag:string, spanned:boolean}|null)[][]} */
    const grid = [];
    // rowspan 으로 아래 행까지 채워야 하는 칸들. 열 인덱스 → {남은 행 수, 값}
    const carry = new Map();

    rows.forEach((row, y) => {
      grid[y] ??= [];
      let x = 0;
      // 위 행에서 내려오는 칸을 먼저 놓는다
      for (const [col, held] of [...carry.entries()].sort((a, b) => a[0] - b[0])) {
        while (grid[y].length < col) grid[y].push(undefined);
        grid[y][col] = { ...held.cell, spanned: true };
        held.left -= 1;
        if (held.left <= 0) carry.delete(col);
      }

      for (const cm of row.matchAll(/<(t[hd])\b([^>]*)>([\s\S]*?)(?=<\/t[hd]>|<t[hd]\b|<\/tr>|$)/gi)) {
        const tag = cm[1].toLowerCase();
        const rawAttrs = cm[2] ?? '';
        const text = normalizeText(cm[3]);
        const colspan = num(attr(`<x ${rawAttrs}>`, 'colspan'));
        const rowspan = num(attr(`<x ${rawAttrs}>`, 'rowspan'));

        for (let c = 0; c < colspan; c++) {
          while (grid[y][x] !== undefined) x++;
          const at = x;
          const cell = { text, tag, spanned: c > 0 };
          grid[y][at] = cell;
          if (rowspan > 1) carry.set(at, { left: rowspan - 1, cell });
          x++;
        }
      }
    });

    // 구멍을 빈 칸으로 메워 직사각으로 만든다
    const width = Math.max(0, ...grid.map(r => r.length));
    const rect = grid.map(r =>
      Array.from({ length: width }, (_, i) => r[i] ?? { text: '', tag: 'td', spanned: false }),
    );

    return {
      caption: caption ? normalizeText(caption[1]) : null,
      grid: rect,
      html: table,
    };
  });
}

/**
 * 헤더 텍스트로 표를 고른다.
 *
 * @param {ReturnType<typeof readTables>} tables
 * @param {(string|RegExp)[]} wanted 헤더에 반드시 있어야 하는 것들
 * @returns {{table, headerRow:number, col:Record<string,number>}|null}
 */
export function tableByHeader(tables, wanted) {
  for (const table of tables) {
    // 헤더는 보통 첫 행이지만, 제목 행이 앞에 붙는 표가 있어 앞쪽 몇 행을 본다
    for (let y = 0; y < Math.min(table.grid.length, 3); y++) {
      const cells = table.grid[y].map(c => c.text);
      const col = {};
      const ok = wanted.every(want => {
        const i = cells.findIndex(t =>
          typeof want === 'string' ? t.replace(/\s/g, '').includes(want.replace(/\s/g, '')) : want.test(t),
        );
        if (i < 0) return false;
        col[String(want)] = i;
        return true;
      });
      if (ok) return { table, headerRow: y, col };
    }
  }
  return null;
}

/** 헤더 아래 행들을 {헤더키: 텍스트} 로 */
export function rowsAsObjects(picked) {
  const { table, headerRow, col } = picked;
  return table.grid.slice(headerRow + 1).map(row => {
    const out = {};
    for (const [key, i] of Object.entries(col)) out[key] = row[i]?.text ?? '';
    out._cells = row.map(c => c.text);
    return out;
  });
}

/** meta refresh 목적지 또는 frameset 본문 프레임. probe-crawl 과 같은 규칙을 쓴다. */
export function followTarget(html, baseUrl) {
  const source = String(html ?? '');
  const meta = source.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]*>/i)?.[0];
  if (meta) {
    const c = meta.match(/content=["']?\s*(\d+)\s*;\s*url=([^"'>\s]+)/i);
    if (c && Number(c[1]) <= 5) return abs(c[2], baseUrl);
  }
  const fs = source.match(/<frameset[\s\S]*?<\/frameset>/i)?.[0];
  if (fs) {
    const dims = (fs.match(/(?:cols|rows)=["']?([^"'>]+)/i)?.[1] ?? '').split(',').map(s => s.trim());
    const scored = [...fs.matchAll(/<frame\b[^>]*>/gi)].map((m, i) => {
      const src = attr(m[0], 'src');
      const name = (attr(m[0], 'name') ?? '').toLowerCase();
      const dim = dims[i] ?? '';
      return { src, score: (/^0%?$/.test(dim) ? -10 : 0) + (/body|main|content/.test(name) ? 5 : 0) };
    }).filter(x => x.src);
    scored.sort((a, b) => b.score - a.score);
    if (scored.length) return abs(scored[0].src, baseUrl);
  }
  return null;
}

function abs(href, base) {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}
