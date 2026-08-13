// 산출물 읽기·병합·쓰기와 원본 아카이브. 의존성 없음.
//
// 여기가 존재하는 이유는 하나다: 소스 하나가 죽은 날 그 시행그룹이 화면에서
// 사라지면 안 된다 (FR-DAT-07). 낡은 데이터를 **낡았다고 밝히면서** 보여주는 것이
// 사라지는 것보다 낫다.
//
// 산출물이 git 에 추적되어야 이게 성립한다. CI 는 매번 깨끗한 체크아웃에서 돌기
// 때문에, 저장소에 이전 결과가 없으면 readPrevious() 가 항상 null 이고 폴백은
// 코드가 아무리 정확해도 무동작이 된다.

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const PUBLISHED = 'data/published';
export const ARCHIVE = 'data/archive';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/** 이벤트 배열의 내용 해시. 일정이 바뀌었는지 판정하는 유일한 기준 */
export function hashEvents(events) {
  return sha256(events.map(e => `${e.kind}:${e.phase}:${e.start}:${e.end}:${e.seq}`).join('|'));
}

// ---- 읽기 -------------------------------------------------------------

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * 직전 발행 결과. 없으면 null (첫 실행 또는 저장소에 산출물이 없는 경우).
 * null 이면 폴백이 불가능하다는 뜻이므로 호출부가 그 사실을 로그로 남겨야 한다.
 */
export async function readPrevious(dir = PUBLISHED) {
  const [sessions, groups, meta, provenance] = await Promise.all([
    readJson(`${dir}/sessions.json`),
    readJson(`${dir}/groups.json`),
    readJson(`${dir}/meta.json`),
    readJson(`${dir}/provenance.json`),
  ]);
  if (!sessions) return null;
  return { sessions, groups, meta, provenance: provenance ?? {} };
}

// ---- 병합 -------------------------------------------------------------

/**
 * 소스별 수확 결과를 직전 결과와 병합한다.
 *
 * **병합 단위는 세션이 아니라 소스다.** 세션 단위로 병합하면 기관이 회차를 정정
 * 삭제했을 때(오타 수정 등) 유령 회차가 영원히 남는다. 소스가 성공하면 그 소스의
 * 세션을 전량 교체하고, 실패하면 전량 계승한다.
 *
 * @param {{id:string, method:string, ok:boolean, sessions?:object[], error?:string|null}[]} harvests
 * @param {{sessions:{sessions:object[]}, provenance:object}|null} prev
 * @param {{now:string}} ctx
 */
export function mergeStale(harvests, prev, { now }) {
  const prevSessions = prev?.sessions?.sessions ?? [];
  const prevProv = prev?.provenance ?? {};
  const prevBySource = new Map();
  for (const s of prevSessions) {
    const src = s.src ?? 'unknown';
    if (!prevBySource.has(src)) prevBySource.set(src, []);
    prevBySource.get(src).push(s);
  }

  const sessions = [];
  const provenance = {};
  const sources = {};
  const failedSources = [];
  const notes = [];

  const CONF = { api: 'verified', file: 'verified', crawl: 'parsed', manual: 'manual' };

  for (const h of harvests) {
    if (h.ok) {
      const conf = CONF[h.method] ?? 'parsed';
      for (const s of h.sessions ?? []) {
        const hash = hashEvents(s.events);
        const before = prevProv[s.id];
        // 내용이 같으면 '처음 관측한 시각' 을 보존한다. 매일 갱신하면 변경 감지가 죽는다.
        const observedAt = before && before.hash === hash ? before.observedAt : now;
        sessions.push({ ...s, src: h.id, conf });
        provenance[s.id] = { src: h.id, method: h.method, hash, observedAt, fetchedAt: now };
      }
      sources[h.id] = {
        health: 'ok',
        method: h.method,
        fetchedAt: now,
        sessionCount: (h.sessions ?? []).length,
      };
      continue;
    }

    // 실패 — 이전 값을 계승하고 낡았다고 표시한다
    const inherited = prevBySource.get(h.id) ?? [];
    for (const s of inherited) {
      sessions.push({ ...s, src: h.id, conf: 'stale', stale: true });
      const before = prevProv[s.id];
      if (before) provenance[s.id] = { ...before };
    }
    sources[h.id] = {
      health: inherited.length ? 'stale' : 'failed',
      method: h.method,
      // 실패했으므로 fetchedAt 을 지금으로 갱신하지 않는다. 마지막 성공 시각을 남긴다.
      fetchedAt: prev?.meta?.sources?.[h.id]?.fetchedAt ?? null,
      sessionCount: inherited.length,
      reason: h.error ?? '알 수 없는 실패',
    };
    failedSources.push(h.id);
    notes.push(
      inherited.length
        ? `${h.id} 실패 — 이전 ${inherited.length}회차를 유지하고 stale 로 표시했다 (${h.error})`
        : `${h.id} 실패 — 계승할 이전 데이터도 없다. 이 소스의 그룹은 일정 없이 표시된다 (${h.error})`,
    );
  }

  // 레지스트리에서 빠진 소스는 계승하지 않고 버린다. 조용히 사라지면 안 되므로 기록한다.
  const active = new Set(harvests.map(h => h.id));
  for (const [src, list] of prevBySource) {
    if (active.has(src)) continue;
    notes.push(`${src} 는 이번 실행의 소스 목록에 없어 ${list.length}회차를 제거했다`);
  }

  sessions.sort((a, b) => a.groupId.localeCompare(b.groupId) || (a.seq ?? 0) - (b.seq ?? 0));
  return { sessions, provenance, sources, failedSources, notes };
}

// ---- 쓰기 -------------------------------------------------------------

/** 산출물 전량. 실패가 있어도 **항상 쓴다** — 파서 하나가 틀린 것으로 사이트를 얼리지 않는다. */
export async function writeAll({ dir = PUBLISHED, year, sessions, groups, exams, categories, links, meta, provenance }) {
  await mkdir(dir, { recursive: true });
  const w = (name, obj, pretty = 0) => writeFile(`${dir}/${name}`, JSON.stringify(obj, null, pretty), 'utf8');
  await Promise.all([
    w('sessions.json', { year, sessions }),
    w('groups.json', { year, groups }),
    w('exams.json', { exams, categories, links }),
    w('meta.json', meta, 2),
    // 해시는 클라이언트 페이로드에서 빼고 여기에만 둔다. 무작위 문자열이라 압축이 안 된다.
    w('provenance.json', provenance, 0),
  ]);
}

/**
 * 원본 스냅샷. **내용 해시가 직전과 같으면 쓰지 않는다.**
 *
 * 하루 1회 × 240KB 를 무조건 커밋하면 1년에 파일 365개가 쌓인다. 일정은 연초에
 * 확정된 뒤 거의 변하지 않으므로 해시로 걸면 연 수십 건이 되고, 남은 파일 목록
 * 자체가 '언제 일정이 바뀌었는가' 의 기록이 된다 (FR-DAT-08).
 *
 * @returns {{written:boolean, path:string, hash:string, reason:string}}
 */
export async function archive({ year, sourceId, body, dir = ARCHIVE, stamp }) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const hash = sha256(text);
  const base = `${dir}/${year}`;
  await mkdir(base, { recursive: true });

  const existing = (await readdir(base).catch(() => []))
    .filter(f => f.startsWith(`${sourceId}.`) && f.endsWith('.json'))
    .sort();
  const last = existing.at(-1);
  if (last) {
    // 파일명에 해시 앞 12자를 넣어 두므로 파일을 읽지 않고 비교할 수 있다
    const lastHash = last.split('.').at(-2);
    if (lastHash && hash.startsWith(lastHash)) {
      return { written: false, path: `${base}/${last}`, hash, reason: '내용이 직전과 동일' };
    }
  }

  const path = `${base}/${sourceId}.${stamp}.${hash.slice(0, 12)}.json`;
  await writeFile(path, text, 'utf8');
  return {
    written: true,
    path,
    hash,
    reason: last ? '내용이 바뀌었다' : '첫 스냅샷',
  };
}
