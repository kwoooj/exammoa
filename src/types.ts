// 데이터 계약. docs/reference/데이터-스키마.md 와 scripts/collect.mjs 가 이 형태를 만든다.

export type EventKind = 'reg' | 'exam' | 'result';
export type EventPhase = 'written' | 'practical' | 'single';

/** 시험 일정의 날짜 하나. start === end 이면 시점(점), 다르면 구간(막대). */
export interface ExamEvent {
  kind: EventKind;
  phase: EventPhase;
  /** YYYY-MM-DD */
  start: string;
  /** YYYY-MM-DD. 시점 이벤트는 start 와 동일 */
  end: string;
  /** 같은 kind 가 여럿일 때의 순번. 정기접수 1, 추가접수 2 */
  seq: number;
  label: string;
  note: string | null;
}

/**
 * 한 시행그룹의 한 시행 단위 (예: 공단 정기 2026년 3회)
 *
 * 일정의 주체는 종목이 아니라 시행그룹이다. 실측 결과 기사·산업기사·서비스 계열
 * 16종목의 연간 일정이 픽셀 단위로 동일했다. 종목별로 행을 만들면 같은 행이
 * 여러 개 그려져 정보량이 0이 된다.
 */
export interface Session {
  id: string;
  groupId: string;
  year: number;
  /** 시행회차. 상시시험은 null */
  seq: number | null;
  label: string | null;
  mode: 'scheduled' | 'rolling';
  status: 'confirmed' | 'tbd';
  events: ExamEvent[];
  /** 이 회차를 만든 원본 레코드 수. 1건이면 생략 (Q-Net은 필기행·실기행이 분리돼 온다) */
  sourceRows?: number;
  /** description 이 여러 개일 때만 */
  labels?: string[];
  /**
   * 같은 (kind, phase) 에 서로 다른 날짜가 주장된 경우. 접수 구간 다중은 정상이므로
   * 여기 담지 않는다. 조용히 하나를 버리지 않기 위해 남긴다.
   */
  contradictions?: { kind: string; phase: string; ranges: [string, string][] }[];
}

/** 시행 주기. 타임라인 표현과 판정 방식을 결정한다 */
export type Cadence =
  /** 연 몇 회. 막대로 그리고 판정 대상 */
  | 'periodic'
  /** 연 12회 이상. 개별 막대 대신 요약 밴드. 응시 예정일을 지정하면 판정 대상 */
  | 'frequent'
  /** 확정 일정 없음. 목표 시기 지정만 가능 */
  | 'rolling';

/** 일정을 공유하는 종목 묶음. 타임라인의 한 행 = 그룹 하나 */
export interface ScheduleGroup {
  id: string;
  /** 표시명. 시행기관을 함께 노출해야 한다 (아래 주석 참고) */
  name: string;
  /**
   * 시행기관. 화면에 반드시 함께 표기한다.
   * "빅데이터분석기사"·"정보보안기사"처럼 이름에 '기사'가 붙지만 공단 정기 일정과
   * 무관한 종목이 있어, 기관 표기가 없으면 같은 일정으로 오인된다.
   */
  agency: string;
  cadence: Cadence;
  rollingRule?: string;
  /** 이 그룹의 일정을 따르는 종목들 */
  examSlugs: string[];
  /** 수집 경로. 'none' 은 v0 대상 아님 */
  collect?: 'qnet-api' | 'crawl' | 'csv' | 'manual' | 'none';
  /**
   * 자동 수집 대상 주소. **robots.txt 가 허용한 곳만** 넣는다.
   * 금지된 기관은 sourceUrl 을 비우고 agencyUrl 만 둔다 — 필드 이름으로 구분을 강제해,
   * 나중에 누군가 금지 사이트를 수집 대상에 다시 집어넣는 것을 막는다.
   */
  sourceUrl?: string;
  /** 사용자 클릭용 기관 링크. 수집 대상이 아니어도 항상 제공한다 (NFR-REL-02) */
  agencyUrl?: string;
  applyUrl?: string;
  /** 이번 수집에서 이 그룹이 만든 회차 수. 0 이면 아직 수집 경로가 붙지 않은 것 */
  sessionCount?: number;
  note?: string;
}

/** 시드가 같은 그룹이라 선언했는데 실측 일정이 갈린 경우. 사람이 시드를 고쳐야 한다. */
export interface GroupSplit {
  groupId: string;
  variantCount: number;
  variants: { groupId: string; examSlugs: string[]; sessionCount: number }[];
}

export interface Exam {
  slug: string;
  name: string;
  short: string | null;
  /** 소속 시행그룹. 이 종목의 일정은 그룹에서 가져온다 */
  groupId: string;
  /** Q-Net 종목코드 4자리. 문자열이며 0 패딩 유지 */
  jmCd: string | null;
  qualgbCd: 'T' | 'C' | 'W' | 'S' | null;
  series: string | null;
  category: string;
  tier: 'T1' | 'T2' | 'T3' | 'T4';
  priority: number;
  agency?: string;
  sourceUrl?: string;
  /** true 면 확정 일정이 없다. 타임라인에 막대를 그리지 않는다 */
  rolling?: boolean;
  rollingRule?: string;
  note?: string;
}

export interface Category {
  id: string;
  name: string;
}

// ---- 응시 예정일 ------------------------------------------------------

/**
 * 사용자가 "언제 볼 예정인지" 지정한 것.
 *
 * 실측 결과 시험 이벤트 243개 중 239개가 기간 시행(필기 중위 5일, 실기 중위 19일)이라
 * 기간끼리 겹쳐도 실제로는 응시일을 조정할 수 있다. 사용자가 예정일을 지정하면
 * 그 시험은 고정일이 되고, 그때부터 의미 있는 충돌 판정이 가능해진다.
 */
export interface ExamPlan {
  examSlug: string;
  groupId: string;
  /** 회차 선택 (frequent 종목). Session.id */
  sessionId?: string;
  phase?: EventPhase;
  /** 기간 안에서 고른 응시일. 'YYYY-MM-DD' */
  date?: string;
  /** 확정 일정이 없는 rolling 종목의 목표 시기. 'YYYY-MM' */
  targetMonth?: string;
}

// ---- 충돌 -------------------------------------------------------------

export type ConflictLevel = 'blocking' | 'warning' | 'info';

export interface Conflict {
  level: ConflictLevel;
  /** YYYY-MM-DD. 충돌 구간 */
  start: string;
  end: string;
  a: { groupId: string; examSlug: string; event: ExamEvent };
  b: { groupId: string; examSlug: string; event: ExamEvent };
  message: string;
}

// ---- 빌드 산출물 ------------------------------------------------------

export interface SessionsFile {
  year: number;
  sessions: Session[];
}

export interface GroupsFile {
  year: number;
  groups: ScheduleGroup[];
}

export interface ExamsFile {
  exams: Exam[];
  categories: Category[];
  links?: unknown;
}

export interface MetaFile {
  fetchedAt: string;
  year: number;
  examCount: number;
  /** 타임라인 행 수와 같다. 종목 수가 아니다 */
  groupCount: number;
  sessionCount: number;
  eventCount: number;
  tbdCount: number;
  contradictionCount: number;
  groupSplitCount: number;
  groupSplits: GroupSplit[];
  /** 접기 전 종목별 회차 총합. groupCount 대비 중복률을 보는 값 */
  sessionsBeforeFold: number;
  rawArchive: string;
  failed: { slug: string; jmCd: string; reason: string }[];
}
