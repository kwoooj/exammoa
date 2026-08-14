// 드리프트 감지. 의존성 없음.
//
// 크롤링은 터지지 않고 **어긋난다.** 사이트가 표를 개편하면 대개 예외가 아니라 빈 표로
// 나타나고, 그러면 파서는 성공적으로 0건을 돌려준다. 조용히 0건을 게시하는 것이 가장
// 위험한 실패다.
//
// 헤더 검사(`tableByHeader`)가 1차 방어선이지만 그것만으로는 부족하다. 헤더는 그대로인데
// 행 구조만 바뀌면 회차가 6건에서 1건으로 줄어도 통과한다.
//
// ---- 기준선을 직전 1회로 잡지 않는 이유 ---------------------------------
//
// 직전과 비교하면 **직전이 이미 깨져 있었을 때 깨진 값이 정상으로 승격된다.** 6건 → 1건
// 으로 떨어진 다음 날 1건 → 1건이면 변화가 없으므로 통과다. 그래서 최근 이력의 중위값을
// 쓴다. 중위값은 한두 번의 이상치에 흔들리지 않는다.
//
// ---- 자연스러운 감소와 개편을 가르는 법 ---------------------------------
//
// 회차 수는 정상적으로도 줄어든다. 토익 페이지는 지난 회차를 내리므로 45 → 44 → 43 으로
// 서서히 빠진다. 그건 드리프트가 아니다. 중위값이 그 완만한 감소를 따라가고, 임계는
// **절반**이라 하루 만에 반토막이 나는 경우만 잡는다.

/** 이력에 남길 실행 수. 30일이면 중위값이 주 단위 변동에 흔들리지 않는다. */
export const HISTORY_LIMIT = 30;

/** 이 비율 아래로 떨어지면 개편 신호로 본다. 완만한 감소는 통과시킨다. */
export const DROP_RATIO = 0.5;

/** 기준선을 만들려면 최소 이만큼의 이력이 필요하다. 한두 번으로는 중위값이 의미 없다. */
export const MIN_SAMPLES = 3;

export function median(values) {
  const xs = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = xs.length >> 1;
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

/**
 * 소스별 기준선. 성공한 실행만 센다.
 *
 * 실패한 실행의 숫자를 넣으면 stale 로 계승된 값이 기준선에 섞여 판정이 무뎌진다.
 *
 * @param {{at:string, sources:Record<string,{sessions:number, events:number}>}[]} runs
 * @returns {Record<string, {sessions:number|null, events:number|null, samples:number}>}
 */
export function baselines(runs) {
  const bySource = new Map();
  for (const run of runs ?? []) {
    for (const [id, s] of Object.entries(run.sources ?? {})) {
      if (!bySource.has(id)) bySource.set(id, []);
      bySource.get(id).push(s);
    }
  }
  const out = {};
  for (const [id, list] of bySource) {
    out[id] = {
      sessions: median(list.map(s => s.sessions)),
      events: median(list.map(s => s.events)),
      samples: list.length,
    };
  }
  return out;
}

/**
 * 이번 실행이 기준선에서 벗어났는가.
 *
 * @param {{id:string, sessions:number, events:number}} now
 * @param {{sessions:number|null, events:number|null, samples:number}|undefined} base
 * @returns {{drift:boolean, reason:string|null}}
 */
export function detectDrift(now, base) {
  // 이력이 없으면 비교할 수 없다. 새 소스를 첫날부터 실패시키지 않는다.
  if (!base || base.samples < MIN_SAMPLES) return { drift: false, reason: null };

  for (const [field, label] of [['sessions', '회차'], ['events', '이벤트']]) {
    const expected = base[field];
    const actual = now[field];
    if (!Number.isFinite(expected) || expected === 0) continue;
    if (!Number.isFinite(actual)) continue;
    if (actual < expected * DROP_RATIO) {
      return {
        drift: true,
        reason: `${label} ${actual}건 — 최근 ${base.samples}회 중위값 ${expected}건의 절반 미만 (사이트 개편 가능)`,
      };
    }
  }
  return { drift: false, reason: null };
}

/**
 * 이력에 이번 실행을 더한다. **성공한 소스만** 담는다.
 *
 * @param {{runs:object[]}|null} history
 * @param {{at:string, sources:Record<string,{sessions:number, events:number}>}} run
 */
export function appendRun(history, run) {
  const runs = [...(history?.runs ?? []), run];
  // 오래된 것부터 버린다
  return { runs: runs.slice(-HISTORY_LIMIT) };
}

/** 수확 결과 → 이력 한 줄 (성공한 소스만) */
export function runRecord(harvests, at) {
  const sources = {};
  for (const h of harvests) {
    if (!h.ok) continue;
    const list = h.sessions ?? [];
    sources[h.id] = {
      sessions: list.length,
      events: list.reduce((n, s) => n + (s.events?.length ?? 0), 0),
    };
  }
  return { at, sources };
}

/** 사람이 읽는 한 줄 */
export function driftLine(id, now, base, verdict) {
  const b = base?.sessions;
  const tail = Number.isFinite(b) ? ` (중위값 ${b}건 / ${base.samples}회)` : ' (기준선 없음)';
  return `${verdict.drift ? '⚠' : ' '} ${id} 회차 ${now.sessions}건${tail}`;
}
