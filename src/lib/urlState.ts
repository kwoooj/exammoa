/**
 * 계획을 URL 에 담는다. 로그인 없이 재방문 시 복원되고, 링크 공유가 그대로 된다.
 *
 * 형식: `?p=슬러그|단계|회차|MMDD,슬러그|단계|회차|MMDD`
 *   정보처리기사|w|3|0820,한국사능력검정시험|s|77
 *
 * sessionId(`hrdk-regular-2026-3`) 를 그대로 넣지 않는 이유는 두 가지다. 길어서
 * 한글 슬러그와 함께 퍼센트 인코딩되면 URL 이 감당하기 어려워지고, 회차 번호가
 * 사람이 읽을 수 있는 값이라 링크를 보고도 무엇인지 짐작할 수 있다.
 *
 * 연도는 담지 않는다. 산출물이 한 해 단위이므로 sessions 쪽 연도를 따른다.
 */

import type { Exam, EventPhase, ExamPlan, Session } from '../types.ts';

const PHASE_CODE: Record<EventPhase, string> = { written: 'w', practical: 'p', single: 's' };
const CODE_PHASE: Record<string, EventPhase> = { w: 'written', p: 'practical', s: 'single' };

export function encodePlans(plans: ExamPlan[], sessions: Session[]): string {
  const byId = new Map(sessions.map(s => [s.id, s]));
  return plans
    .map(p => {
      const seq = byId.get(p.sessionId)?.seq;
      const md = p.date ? p.date.slice(5).replace('-', '') : '';
      return [p.examSlug, PHASE_CODE[p.phase], seq ?? 'x', md].join('|');
    })
    .join(',');
}

/**
 * 잘못된 항목은 조용히 버리고 나머지를 복원한다 (FR-STA-03).
 * 링크가 오래돼 일정이 바뀐 경우에도 화면이 뜨는 것이 중요하다.
 */
export function decodePlans(raw: string, exams: Exam[], sessions: Session[]): ExamPlan[] {
  if (!raw) return [];
  const examBySlug = new Map(exams.map(e => [e.slug, e]));
  const out: ExamPlan[] = [];
  const seen = new Set<string>();

  for (const chunk of raw.split(',')) {
    const [slug, code, seqRaw, md] = chunk.split('|');
    if (!slug || !code) continue;

    const exam = examBySlug.get(slug);
    const phase = CODE_PHASE[code];
    if (!exam || !phase) continue;

    const session = sessions.find(
      s => s.groupId === exam.groupId && String(s.seq ?? 'x') === (seqRaw ?? 'x'),
    );
    if (!session) continue;

    const key = `${slug}|${phase}|${session.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const plan: ExamPlan = { examSlug: slug, groupId: exam.groupId, sessionId: session.id, phase };
    if (md && /^\d{4}$/.test(md)) {
      plan.date = `${session.year}-${md.slice(0, 2)}-${md.slice(2)}`;
    }
    out.push(plan);
  }
  return out;
}

// ---- 브라우저 연동 -----------------------------------------------------

const STORAGE_KEY = 'exammoa.plans';

export function readInitial(exams: Exam[], sessions: Session[]): ExamPlan[] {
  const fromUrl = new URLSearchParams(window.location.search).get('p');
  if (fromUrl) return decodePlans(fromUrl, exams, sessions);
  try {
    return decodePlans(window.localStorage.getItem(STORAGE_KEY) ?? '', exams, sessions);
  } catch {
    // 시크릿 모드 등에서 localStorage 접근이 막힐 수 있다. 빈 상태로 시작한다.
    return [];
  }
}

export function persist(plans: ExamPlan[], sessions: Session[]): void {
  const encoded = encodePlans(plans, sessions);
  const url = new URL(window.location.href);
  if (encoded) url.searchParams.set('p', encoded);
  else url.searchParams.delete('p');
  window.history.replaceState(null, '', url);
  try {
    window.localStorage.setItem(STORAGE_KEY, encoded);
  } catch {
    /* 저장이 막혀도 화면은 동작해야 한다 */
  }
}
