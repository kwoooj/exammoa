/**
 * 라우트 껍데기.
 *
 * 각 화면의 알맹이는 뒤따르는 PR 이 채운다. 여기서 확인하려는 것은 **사전 렌더가
 * 라우트마다 진짜 내용을 HTML 소스에 박는가** 하나뿐이라, 데이터에서 나온 문자열을
 * 최소한 하나씩 그린다. 빈 껍데기만 두면 파이프라인이 68개의 빈 파일을 성공적으로
 * 만들어 놓고 초록불을 켠다 — 규칙 10 이 경고하는 실패 형태 그대로다.
 */

import type { AppData } from '../data/index.ts';
import { agencyOf, sessionsOf } from '../data/index.ts';
import { statusOfExam } from '../lib/status.ts';
import { freshnessOfSource } from '../lib/freshness.ts';
import { ROUTE_PATHS, examPath } from '../lib/routes.ts';
import { Link } from '../router/Link.tsx';

interface ScreenProps {
  data: AppData;
  today: string;
}

/** 뒤따르는 PR 이 채울 자리임을 화면에도 정직하게 적는다 */
function Pending({ what }: { what: string }) {
  return <p className="muted small">{what}는 준비 중입니다.</p>;
}

export function Home({ data, today }: ScreenProps) {
  void today;
  return (
    <>
      <section className="hero">
        <h1>흩어진 시험 일정을 한곳에서 확인하세요</h1>
        <p className="lede">
          접수 기간과 시험일을 비교하고 공식 접수처로 바로 이동할 수 있어요. 로그인은 없어요.
        </p>
      </section>
      <section className="section">
        <p className="small muted">
          시험 {data.meta.examCount}개 · 시행그룹 {data.meta.groupCount}개
        </p>
        <p><Link to={ROUTE_PATHS.exams}>전체 시험 일정 보기</Link></p>
      </section>
      <Pending what="검색과 이번 달 캘린더 미리보기" />
    </>
  );
}

export function Exams({ data, today }: ScreenProps) {
  return (
    <section className="section">
      <h1>시험 일정 찾기</h1>
      <p className="small muted">{data.exams.length}개 시험</p>
      <ul className="cards">
        {data.exams.map(exam => {
          const group = data.groupById.get(exam.groupId);
          const status = statusOfExam(exam, group, sessionsOf(data, exam), today);
          return (
            <li key={exam.slug} className="card">
              <Link to={examPath(exam.slug)}>{exam.name}</Link>
              {' · '}
              <span className="small muted">{agencyOf(data, exam)}</span>
              {' · '}
              <span className="small" aria-label={status.a11yLabel}>{status.label}</span>
            </li>
          );
        })}
      </ul>
      <Pending what="검색·필터·정렬" />
    </section>
  );
}

export function Calendar({ data, today }: ScreenProps) {
  void today;
  return (
    <section className="section">
      <h1>시험 일정 캘린더</h1>
      <p className="small muted">{data.meta.groupCount}개 시행그룹의 공식 일정</p>
      <Pending what="월간 격자와 시험 선택" />
    </section>
  );
}

export function About({ data, today }: ScreenProps) {
  return (
    <section className="section">
      <h1>서비스 소개와 데이터 출처</h1>
      <p className="lede">
        시험모아는 여러 시행기관의 공개 일정을 보기 쉽게 정리한 비공식 서비스입니다.
        접수 가능 여부와 변경된 일정은 반드시 공식 기관에서 다시 확인해 주세요.
      </p>
      <h2>수록 범위</h2>
      <p>시험 {data.meta.examCount}개 · 시행그룹 {data.meta.groupCount}개 · 회차 {data.meta.sessionCount}건</p>
      <h2>소스별 마지막 확인</h2>
      <ul>
        {Object.entries(data.meta.sources).map(([id, source]) => {
          const f = freshnessOfSource(data.meta, id, today);
          return (
            <li key={id} className="small">
              {id} · {source.method} · {f.label} · 회차 {source.sessionCount}건
            </li>
          );
        })}
      </ul>
      <p className="small muted">
        {/* §9.3 — 소스마다 발행 주기가 달라 낡음 기준도 다르다 */}
        연 1회 발표되는 자료를 매일 수집되는 API 와 같은 기준으로 오래됐다고 표시하지 않습니다.
      </p>
    </section>
  );
}

export function Privacy() {
  return (
    <section className="section">
      <h1>개인정보와 브라우저 저장 안내</h1>
      <ul>
        <li>계정과 개인 프로필을 수집하지 않습니다.</li>
        <li>로그인이 없으며 서버에 저장하는 사용자 데이터가 없습니다.</li>
        <li>방문 통계 도구를 사용하지 않습니다. 도입하면 이 문서를 먼저 갱신합니다.</li>
        <li>공식 사이트로 이동하면 해당 기관의 개인정보 정책이 적용됩니다.</li>
      </ul>
    </section>
  );
}

export { ExamDetail } from './ExamDetail.tsx';
export { NotFound } from './NotFound.tsx';
