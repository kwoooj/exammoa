/**
 * 공식 기관으로 나가는 링크. 화면정의 §4.2 · §7.4 · §14.
 *
 * 이 서비스의 종착점은 공식 기관이다. 링크가 없으면 화면 전체가 막다른 길이 된다.
 *
 * 그런데 실측하면 21개 그룹 중 applyUrl 은 2개, agencyUrl 은 14개다. 그대로
 * §4.2 의 우선순위만 돌리면 나머지가 전부 "공식 링크 확인 중" 으로 떨어진다.
 * 그래서 `exams.json` 의 `links.patterns.qnetDetail` 로 jmCd 를 끼워 종목 상세를
 * 조립한다 — 51종목이 여기서 나온다.
 *
 * **조립은 화이트리스트로만 한다.** 잘못된 jmCd 는 오류를 내지 않고 엉뚱한 종목
 * 페이지를 보여준다 (9999 인수통합종목 · 0000 한자실력급수 · 2010 폐지된 기사2급 ·
 * 미지정 백지). 오류라면 눈에 띄지만 이건 조용히 틀린다 — 사용자가 다른 시험의
 * 접수 안내를 읽고 자기 시험을 놓친다.
 *
 * 규칙 자체는 데이터에 있고(`links.rules`) 여기서는 그것을 강제만 한다.
 * robots.txt 는 자동 크롤러 규약이라 링크 삽입과 무관하다 — 수집 금지 사이트도
 * 사용자가 클릭해 이동하는 것은 막지 않는다.
 */

import type { Exam, ExamsFile, LinksFile, ScheduleGroup } from '../types.ts';

/** 무엇으로 연결되는가. 화면이 버튼 문구를 고르는 근거 */
export type LinkKind =
  | 'apply'        // 그 시험의 원서접수 페이지
  | 'apply-guide'  // 종목별이 아닌 일반 접수 안내
  | 'official'     // 기관 공식 정보 페이지
  | 'none';        // 보낼 곳이 없다

/** 이 주소가 어디서 나왔는가. 같은 href 라도 출처에 따라 버튼 문구가 달라진다 */
export type LinkSource =
  | 'group.applyUrl'
  | 'group.agencyUrl'
  | 'exam.agencyUrl'
  | 'qnet-detail'
  | 'qnet-guide';

export interface OfficialLink {
  kind: LinkKind;
  /** kind === 'none' 이면 null */
  href: string | null;
  /** 화면 문구. §16.1 정본 */
  label: string;
  /** 접근성 이름. §14 — 어느 기관의 무엇인지, 새 창인지 미리 알린다 */
  a11yLabel: string;
  source: LinkSource | null;
}

/**
 * 절대 조립하면 안 되는 종목코드. `exams.seed.json` 의 실측 주석에서 옮겼다.
 * 전부 "오류 없이 엉뚱한 것을 보여주는" 코드다.
 */
export const DENIED_JMCD: ReadonlySet<string> = new Set(['9999', '0000', '2010']);

const JMCD_SHAPE = /^\d{4}$/;

/**
 * 게시 데이터에 실제로 있는 종목코드만 모은다.
 *
 * 형식 검사(4자리)와 거부 목록만으로는 부족하다. 형식이 맞는 미지정 코드는
 * 백지 페이지를 준다. "우리가 아는 종목의 코드" 라는 것까지 확인해야 한다.
 */
export function jmCdWhitelist(exams: Exam[]): ReadonlySet<string> {
  const out = new Set<string>();
  for (const e of exams) {
    if (e.jmCd && JMCD_SHAPE.test(e.jmCd) && !DENIED_JMCD.has(e.jmCd)) out.add(e.jmCd);
  }
  return out;
}

/**
 * `links` 블록을 안전하게 꺼낸다.
 *
 * JSON.parse 결과라 계약대로라는 보장이 없다. 없거나 모양이 다르면 빈 객체를
 * 돌려주고, 화면은 그룹 링크로 계속 동작한다 (부분 실패로 전체를 멈추지 않는다).
 */
export function readLinks(file: Pick<ExamsFile, 'links'>): LinksFile {
  const links: unknown = file.links;
  if (!links || typeof links !== 'object') return {};
  return links as LinksFile;
}

/**
 * Q-Net 종목 상세 주소. 조립할 수 없으면 null 이다.
 *
 * `verified` 가 참일 때만 만든다. 사람이 열어 보지 않은 템플릿으로 51개 페이지의
 * 링크를 만들면, 틀렸을 때 51번 틀린다.
 */
export function qnetDetailUrl(
  jmCd: string | null,
  links: LinksFile,
  whitelist: ReadonlySet<string>,
): string | null {
  if (!jmCd || !JMCD_SHAPE.test(jmCd)) return null;
  if (DENIED_JMCD.has(jmCd)) return null;
  if (!whitelist.has(jmCd)) return null;

  const pattern = links.patterns?.qnetDetail;
  if (!pattern?.verified || !pattern.template.includes('{jmCd}')) return null;

  return pattern.template.replace('{jmCd}', jmCd);
}

function agencyOf(exam: Exam, group: ScheduleGroup | undefined): string {
  return exam.agency ?? group?.agency ?? '시행기관';
}

function link(
  kind: Exclude<LinkKind, 'none'>,
  href: string,
  source: LinkSource,
  label: string,
  exam: Exam,
  group: ScheduleGroup | undefined,
): OfficialLink {
  return {
    kind,
    href,
    label,
    // "원서접수 ↗" 만 읽히면 어느 시험의 것인지 알 수 없다 (§14).
    a11yLabel: `${agencyOf(exam, group)} ${exam.name} ${label} 새 창 열기`,
    source,
  };
}

/** 보낼 곳이 없을 때. 버튼이 아니라 안내 문구로 낸다 (§4.2) */
function noLink(): OfficialLink {
  return { kind: 'none', href: null, label: '공식 링크 확인 중', a11yLabel: '공식 링크 확인 중', source: null };
}

/**
 * 원서접수 CTA. §18 이 꼽는 가장 중요한 전환이다.
 *
 * 종목별 접수 페이지가 없으면 Q-Net 일반 안내로 보내되 **문구를 바꾼다** —
 * 일반 안내를 `원서접수` 라고 적으면 그 버튼이 접수창을 열어 줄 것처럼 읽힌다 (§16).
 * 안내 페이지는 Q-Net 종목일 때만 뜻이 있으므로 화이트리스트를 통과할 때만 쓴다.
 */
export function applyLink(
  exam: Exam,
  group: ScheduleGroup | undefined,
  links: LinksFile,
  whitelist: ReadonlySet<string>,
): OfficialLink {
  if (group?.applyUrl) return link('apply', group.applyUrl, 'group.applyUrl', '원서접수', exam, group);

  const guide = links.common?.qnetApplyGuide;
  if (guide && exam.jmCd && whitelist.has(exam.jmCd)) {
    return link('apply-guide', guide, 'qnet-guide', '원서접수 안내', exam, group);
  }
  return noLink();
}

/**
 * 공식 시험정보 CTA.
 *
 * 종목의 agencyUrl 이 그룹의 것보다 먼저다. 한 그룹이 여러 기관의 종목을 담는
 * 경우가 있어서, 그룹 링크를 먼저 쓰면 종목과 다른 기관으로 보낸다.
 */
export function officialLink(
  exam: Exam,
  group: ScheduleGroup | undefined,
  links: LinksFile,
  whitelist: ReadonlySet<string>,
): OfficialLink {
  if (exam.agencyUrl) return link('official', exam.agencyUrl, 'exam.agencyUrl', '공식 시험정보', exam, group);
  if (group?.agencyUrl) return link('official', group.agencyUrl, 'group.agencyUrl', '공식 시험정보', exam, group);

  const qnet = qnetDetailUrl(exam.jmCd, links, whitelist);
  if (qnet) return link('official', qnet, 'qnet-detail', '공식 시험정보', exam, group);

  return noLink();
}

/**
 * 목록 한 행에 버튼 하나만 둘 때 (§4.2).
 *
 * 접수처가 있으면 그쪽이 우선이다 — 목록에서 사용자가 다음에 할 일은 접수이지
 * 기관 소개를 읽는 것이 아니다.
 */
export function primaryLink(
  exam: Exam,
  group: ScheduleGroup | undefined,
  links: LinksFile,
  whitelist: ReadonlySet<string>,
): OfficialLink {
  const apply = applyLink(exam, group, links, whitelist);
  if (apply.href) return apply;
  return officialLink(exam, group, links, whitelist);
}
