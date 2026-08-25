// 데이터 계약. docs/reference/데이터-스키마.md 와 scripts/collect.mjs 가 이 형태를 만든다.

export type EventKind = 'reg' | 'exam' | 'result';
export type EventPhase = 'written' | 'practical' | 'single';

export interface EventTiming {
  /** HH:mm, 기관이 공지한 한국 현지 시각 */
  start?: string;
  /** HH:mm. 접수기간처럼 시작·마감 시각이 모두 있을 때 */
  end?: string;
  timezone: 'Asia/Seoul';
  /** 단일 시각을 확정할 수 없는 시험은 상태만 저장하고 임의 시각을 만들지 않는다. */
  status: 'confirmed' | 'varies' | 'select-on-booking';
  /** 시험 시작과 다른 입실 마감 시각 */
  admissionDeadline?: string;
  note?: string;
}

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
  /** 공식 소스에 시각이 있을 때만 존재한다. */
  timing?: EventTiming;
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
  /** 공식 일정은 존재할 수 있지만 시험모아 수집 어댑터가 아직 연결되지 않은 상태. */
  scheduleState?: 'import-pending';
  /** 이 회차를 만든 원본 레코드 수. 1건이면 생략 (Q-Net은 필기행·실기행이 분리돼 온다) */
  sourceRows?: number;
  /** description 이 여러 개일 때만 */
  labels?: string[];
  /**
   * 같은 (kind, phase) 에 서로 다른 날짜가 주장된 경우. 접수 구간 다중은 정상이므로
   * 여기 담지 않는다. 조용히 하나를 버리지 않기 위해 남긴다.
   */
  contradictions?: { kind: string; phase: string; ranges: [string, string][] }[];

  /** 이 회차를 만든 소스 id. meta.sources[src] 로 조인해 갱신 시각을 얻는다 */
  src?: string;
  conf?: Confidence;
  /** 이번 실행에서 소스가 실패해 이전 값을 재게시한 경우에만 true */
  stale?: boolean;
}

/**
 * 이 일정을 얼마나 믿을 수 있는가. 화면 표기가 달라지므로 정의를 흐리지 않는다.
 *
 * 해시·최초 관측 시각 같은 검증 메타데이터는 `provenance.json` 에만 두고 클라이언트
 * 페이로드에는 넣지 않는다. 해시는 무작위 문자열이라 압축이 되지 않는다.
 */
export type Confidence =
  /** 기관이 기계 판독용으로 발행 (Q-Net API, 공공데이터 CSV). 배지 없음 */
  | 'verified'
  /** HTML 에서 추출. 사이트 개편으로 조용히 틀릴 수 있어 출처 링크를 노출한다 */
  | 'parsed'
  /** 사람이 입력. 갱신 책임이 사람이므로 확인 날짜를 함께 보여준다 */
  | 'manual'
  /** 소스가 실패해 이전 값을 재게시. "최종 확인 N일 전" 경고 */
  | 'stale';

/** 소스 하나의 이번 실행 결과 */
export interface SourceHealth {
  health: 'ok' | 'stale' | 'failed';
  method: string;
  /**
   * 마지막 **성공** 시각. 실패했을 때 지금으로 갱신하지 않는다 —
   * 갱신하면 화면이 "방금 확인했다" 고 거짓말한다. 계승할 값도 없으면 null.
   */
  fetchedAt: string | null;
  sessionCount: number;
  /**
   * 이 소스가 며칠 지나면 낡은 것인가. 없으면 기본 임계(3일)를 쓴다.
   *
   * 소스마다 갱신 주기가 다르다. 매일 도는 크롤이 4일 됐으면 이상하지만, 연 1회
   * 발행되는 공공데이터 CSV 가 219일 된 것은 정상이다. 하나의 임계로 재면 후자가
   * 매일 거짓 경고를 낸다.
   */
  staleAfterDays?: number;
  reason?: string;
  /** 공식 원본에서 발견한 종목을 전부 분류했는지 보여주는 배치 진단 */
  coverage?: {
    discovered: number;
    included: number;
    unclassified: string[];
    missing: string[];
  };
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
  /**
   * 상시시험 규칙을 사람이 마지막으로 확인한 날 (YYYY-MM-DD).
   *
   * 규칙은 기관이 조용히 바꾼다. 크롤러가 죽으면 빨간불이 켜지지만 수기 규칙이 낡는
   * 것은 아무도 알림을 받지 못한다 — 그래서 확인 날짜를 데이터로 들고 있다가 화면이
   * "마지막 확인 N일 전" 으로 말한다.
   */
  ruleCheckedAt?: string;
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
  /**
   * 수집 경로 등급. 정의는 `exams.seed.json` 의 `tiers` 에 있고 그것이 정본이다.
   * `X` 가 빠져 있었는데 시드는 예전부터 쓰고 있었다 — 화면에 안 나오는 종목이라
   * 런타임에서 안 걸렸을 뿐 계약 위반이었다.
   */
  tier: 'T1' | 'T2' | 'T3' | 'T4' | 'X';
  priority: number;
  /**
   * `data/fees.seed.json`을 기준으로 공식 안내에서 확인한 응시료. 금액은 원 단위이며,
   * 필기·실기처럼 단계가 다르면 항목을 나눠 저장한다. 확인하지 않은 금액은 추정해
   * 채우지 않는다. 매일 수집 배치가 공식 페이지를 재검증해 이 필드를 게시한다.
   */
  fee?: {
    items: { label: string; amount?: number; amountLabel?: string }[];
    /** 공식 페이지를 마지막으로 확인한 날 (YYYY-MM-DD) */
    checkedAt: string;
    /** 추가접수·자격증 발급비처럼 한 줄 금액에 포함되지 않는 조건 */
    note?: string;
  };
  /** 기관·고용관계 등 공식 응시대상 제한. 제한 종목도 일정에서 제외하지 않는다. */
  eligibility?: {
    status: 'restricted';
    note: string;
  };
  agency?: string;
  /**
   * 수집 대상 URL 은 여기 두지 않는다. ScheduleGroup.sourceUrl 이 정본이다 —
   * 종목에 두었더니 실제로 그룹과 어긋났다 (한국사능력검정시험).
   */
  /**
   * 사용자 클릭용 기관 링크. 그룹의 것보다 우선한다 — 한 그룹이 여러 기관의
   * 종목을 담는 경우(ITQ 등)가 있어서다. 수집 대상이 아니므로 sourceUrl 과 달리
   * robots.txt 의 제약을 받지 않는다.
   *
   * 게시 데이터에 4건 있는데 계약에는 없었다. 아무도 읽지 않아 안 걸렸을 뿐이다.
   */
  agencyUrl?: string;
  /** true 면 확정 일정이 없다. 타임라인에 막대를 그리지 않는다 */
  rolling?: boolean;
  rollingRule?: string;
  note?: string;
}

export type CredentialKind =
  | 'national-technical'
  | 'national-professional'
  | 'private-accredited'
  | 'private-registered'
  | 'international-assessment'
  | 'institutional-assessment';

export type AssessmentMode =
  | 'multiple-choice'
  | 'written'
  | 'interview'
  | 'practical'
  | 'computer-task'
  | 'mixed';

export interface AssessmentSection {
  name: string;
  itemCount?: number | { min?: number; max?: number };
  taskCount?: number;
  mode?: AssessmentMode;
  scoreRange?: { min: number; max: number };
  note?: string;
}

/** 감독 진행상 다음 영역으로 넘어가면 되돌아갈 수 없는 실제 제한시간 구간. */
export interface AssessmentTimedBlock {
  name: string;
  durationMinutes: number | { min?: number; max?: number };
  sectionNames?: string[];
  note?: string;
}

export interface AssessmentStage {
  id: string;
  name: string;
  durationMinutes?: number | { min?: number; max?: number };
  /** 과목별 문항 수가 공개되지 않고 단계 전체 문항 수만 공식 공개될 때 사용 */
  totalItemCount?: number | { min?: number; max?: number };
  /** 세부 영역별 배점이 공식 공개되지 않을 때만 쓰는 단계 전체 만점 */
  totalScore?: number;
  sections: AssessmentSection[];
  /** 단순 권장 배분이 아니라 공식 운영상 강제되는 구간만 기록한다. */
  timedBlocks?: AssessmentTimedBlock[];
  note?: string;
}

/** 시험 형식은 회차 시작시각과 별개다. 개정 전 형식을 덮어쓰지 않고 적용 기간으로 고른다. */
export interface AssessmentFormat {
  /** 공식 적용 시작일. 현재 형식만 공개하고 시작일을 밝히지 않으면 생략한다. */
  effectiveFrom?: string;
  effectiveTo?: string;
  checkedAt: string;
  sourceUrl: string;
  totalDurationMinutes?: number | { min?: number; max?: number };
  summary?: string;
  stages: AssessmentStage[];
  note?: string;
}

export interface ExamDetail {
  examSlug: string;
  catalogStatus: 'published' | 'planned';
  /** 상세정보의 공식 근거. detail-sources.seed.json의 id를 참조한다. */
  sourceRefs: string[];
  classification: {
    kind: CredentialKind;
    label: string;
    authority: string;
    sourceUrl: string;
    checkedAt: string;
    note?: string;
  };
  result: {
    type: 'score' | 'pass-fail' | 'level-awarded';
    label: string;
    validityLabel?: string;
    passCriteria?: string;
    note?: string;
  };
  deliveryModes: string[];
  formats: AssessmentFormat[];
}

export interface Category {
  id: string;
  name: string;
}

// ---- 응시 예정일 ------------------------------------------------------

/**
 * 사용자가 "이 시험을 언제 볼 것인지" 지정한 것. 서비스의 중심 데이터다.
 *
 * 실측 결과 시험 이벤트의 98%가 기간 시행(필기 중위 5일, 실기 중위 19일)이다.
 * 기간끼리는 거의 항상 겹치므로 '겹친다' 는 사실 자체가 정보가 되지 못한다.
 * 사용자가 응시일을 지정해야 비로소 D-Day 와 '같은 날' 판단이 의미를 갖는다.
 */
export interface ExamPlan {
  examSlug: string;
  groupId: string;
  /** Session.id */
  sessionId: string;
  phase: EventPhase;
  /**
   * 응시 예정일 'YYYY-MM-DD'.
   * 하루짜리 시험은 자동으로 채워지고, 기간 시행은 사용자가 고를 때까지 비어 있다.
   */
  date?: string;
}

/** 계획 하나를 식별하는 키. 같은 종목의 필기·실기를 따로 담을 수 있어야 한다 */
export type PlanKey = string;

// ---- 빌드 산출물 ------------------------------------------------------

export interface SessionsFile {
  year: number;
  sessions: Session[];
}

export interface GroupsFile {
  year: number;
  groups: ScheduleGroup[];
}

/** 값 하나를 끼워 넣어 공식 URL 을 만드는 규칙 */
export interface LinkPattern {
  /** `{jmCd}` 같은 치환 자리를 가진 주소 */
  template: string;
  appliesTo?: string;
  /** 사람이 실제로 열어 확인했는가. false·없음이면 조립하지 않는다 */
  verified?: boolean;
  note?: string;
}

/**
 * 공식 링크 조립 규칙. `exams.json` 에 함께 실려 나오고 정본은 `exams.seed.json` 이다.
 *
 * 전부 선택적으로 둔다. 이 블록이 통째로 없어도 화면은 group.applyUrl·agencyUrl 로
 * 동작해야 한다 — 링크 규칙 하나가 빠졌다고 62개 상세 페이지가 죽으면 안 된다.
 *
 * 여기 있는 것만 타입에 적는다. JSON 에는 korcham·toeic 패턴도 있지만 화면이
 * 읽지 않으므로 계약에 넣지 않는다. 쓰기 시작할 때 추가한다.
 */
export interface LinksFile {
  patterns?: {
    /**
     * `{jmCd}` 를 끼워 Q-Net 종목 상세를 만든다.
     * **잘못된 코드는 오류 없이 엉뚱한 종목을 보여준다** — 화이트리스트로만 조립한다.
     */
    qnetDetail?: LinkPattern;
  };
  common?: {
    /** 비로그인으로 열리는 원서접수 안내. rcv202.do 는 로그인을 요구해 부적합하다 */
    qnetApplyGuide?: string;
    qnetExamList?: string;
  };
}

export interface ExamsFile {
  exams: Exam[];
  categories: Category[];
  links?: LinksFile;
}

export interface ExamDetailsFile {
  version: string;
  details: ExamDetail[];
}

export interface MetaFile {
  fetchedAt: string;
  year: number;
  examCount: number;
  /** Q-Net API 로 받은 종목 수. examCount 와 다르면 크롤·CSV 가 붙은 것이다 */
  qnetExamCount: number;
  /** 타임라인 행 수와 같다. 종목 수가 아니다 */
  groupCount: number;
  sessionCount: number;
  eventCount: number;
  tbdCount: number;
  /** 소스 실패로 이전 값을 재게시한 회차 수 */
  staleCount: number;
  contradictionCount: number;
  groupSplitCount: number;
  groupSplits: GroupSplit[];
  /** 접기 전 종목별 회차 총합. groupCount 대비 중복률을 보는 값 */
  sessionsBeforeFold: number;
  sources: Record<string, SourceHealth>;
  /** 이번 실행에서 원본을 새로 저장했으면 경로, 내용이 같아 생략했으면 null */
  archive: string | null;
  notes: string[];
  failed: { slug: string; jmCd: string; reason: string }[];
}
