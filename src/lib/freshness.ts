/**
 * 데이터 신선도. NFR-REL-01(최종 확인 시점 표시) · NFR-REL-04(3일 이상 지연 시 경고).
 *
 * "N일 전" 을 빌드 시점에 계산해 저장하지 않는 이유: 정적 사이트라 저장 시점과
 * 조회 시점이 다르다. 하루 전에 만든 JSON 에 "0일 전" 이 박혀 있으면 거짓이 된다.
 * `fetchedAt` 만 저장하고 여기서 계산한다.
 */

import type { MetaFile, SourceHealth } from '../types.ts';
import { diffDays, today } from './dates.ts';

/**
 * 접수 마감을 놓치면 실질적 손해가 나므로 경고 임계를 낮게 잡는다.
 * 단, 소스가 `staleAfterDays` 를 선언하면 그것이 우선한다.
 */
export const STALE_WARN_DAYS = 3;

export interface Freshness {
  /** 가장 오래된 소스가 며칠 전에 확인됐는가. 확인된 소스가 없으면 null */
  worstDays: number | null;
  /** 경고를 띄워야 하는가 */
  warn: boolean;
  /** 이번 실행에서 실패한 소스들 */
  unhealthy: { id: string; source: SourceHealth; days: number | null }[];
  /** **자기 갱신 주기**를 넘긴 소스들. 주기가 다르므로 하나의 임계로 재지 않는다 */
  overdue: { id: string; source: SourceHealth; days: number; limit: number }[];
  /** 사람이 읽는 요약. 정상이면 null */
  message: string | null;
}

/** 이 소스는 며칠까지 정상인가 */
export function limitOf(source: SourceHealth): number {
  return source.staleAfterDays ?? STALE_WARN_DAYS;
}

export function daysSince(iso: string | null, from = today()): number | null {
  if (!iso) return null;
  const date = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return diffDays(from, date);
}

/** "오늘" · "어제" · "3일 전" */
export function agoLabel(days: number | null): string {
  if (days === null) return '기록 없음';
  if (days <= 0) return '오늘';
  if (days === 1) return '어제';
  return `${days}일 전`;
}

export interface SourceFreshness {
  /** 며칠 전에 확인했는가. 확인된 적 없으면 null */
  days: number | null;
  /** 이 소스의 자기 주기를 넘겼는가 */
  overdue: boolean;
  /** 이번 실행에서 실패했는가 */
  failed: boolean;
  /** "마지막 확인 5일 전" (§16.1) */
  label: string;
}

/**
 * 소스 하나의 신선도. 화면정의 §2.4 는 경고를 **항목 단위**로 요구한다 —
 * "특정 소스가 오래됨 → 해당 시험에만 표시".
 *
 * 전체 경고만 있으면 토익 하나가 낡았을 때 화면 맨 위에 배너가 뜨고 62종목이
 * 전부 의심스러워 보인다. 낡은 것이 무엇인지 그 자리에서 말해야 한다.
 *
 * `Session.src` → `meta.sources[src]` 가 조인 키다.
 */
export function freshnessOfSource(meta: MetaFile, srcId: string | undefined, from = today()): SourceFreshness {
  const source = srcId ? meta.sources?.[srcId] : undefined;
  if (!source) {
    // 출처를 모르면 전체 수집 시각으로 답한다. 모른다고 침묵하면 화면이
    // "최종 확인" 을 아예 못 쓴다.
    const days = daysSince(meta.fetchedAt, from);
    return { days, overdue: false, failed: false, label: `마지막 확인 ${agoLabel(days)}` };
  }
  const days = daysSince(source.fetchedAt, from);
  return {
    days,
    overdue: source.health === 'ok' && days !== null && days >= limitOf(source),
    failed: source.health !== 'ok',
    label: `마지막 확인 ${agoLabel(days)}`,
  };
}

export function freshnessOf(meta: MetaFile, from = today()): Freshness {
  const entries = Object.entries(meta.sources ?? {});

  const unhealthy = entries
    .filter(([, s]) => s.health !== 'ok')
    .map(([id, source]) => ({ id, source, days: daysSince(source.fetchedAt, from) }));

  const dayValues = entries
    .map(([, s]) => daysSince(s.fetchedAt, from))
    .filter((d): d is number => d !== null);

  // 소스가 하나라도 확인된 적 없으면 최악을 알 수 없다. null 로 두고 화면이 그렇게 말한다.
  const worstDays = dayValues.length === entries.length && dayValues.length > 0
    ? Math.max(...dayValues)
    : null;

  /**
   * 소스마다 자기 임계로 잰다.
   *
   * 전에는 `worstDays >= 3` 하나로 쟀다. 그러면 연 1회 발행되는 공공데이터 CSV 가
   * 붙는 순간 경고가 **영구히** 켜진다 — 219일 된 것이 그 소스의 정상 상태이기 때문이다.
   * 거짓 경고가 상시로 떠 있으면 진짜 경고를 아무도 읽지 않는다.
   */
  const overdue = entries
    .map(([id, source]) => ({ id, source, days: daysSince(source.fetchedAt, from), limit: limitOf(source) }))
    .filter((x): x is { id: string; source: SourceHealth; days: number; limit: number } =>
      x.source.health === 'ok' && x.days !== null && x.days >= x.limit);

  const warn = unhealthy.length > 0 || overdue.length > 0 || worstDays === null;

  let message: string | null = null;
  if (unhealthy.length) {
    const names = unhealthy.map(u => `${u.id}(${agoLabel(u.days)})`).join(', ');
    message = `일정을 가져오지 못한 곳이 있어요: ${names}. 아래 일정 중 일부는 이전에 확인한 값입니다.`;
  } else if (worstDays === null) {
    message = '아직 확인되지 않은 일정이 있어요. 공식 공고를 확인해 주세요.';
  } else if (overdue.length) {
    const names = overdue.map(o => `${o.id}(${agoLabel(o.days)})`).join(', ');
    message = `갱신이 예상보다 늦은 곳이 있어요: ${names}. 공식 공고를 확인해 주세요.`;
  }

  return { worstDays, warn, unhealthy, overdue, message };
}
