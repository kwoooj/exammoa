/**
 * 라우트 껍데기.
 *
 * 각 화면의 알맹이는 뒤따르는 PR 이 채운다. 여기서 확인하려는 것은 **사전 렌더가
 * 라우트마다 진짜 내용을 HTML 소스에 박는가** 하나뿐이라, 데이터에서 나온 문자열을
 * 최소한 하나씩 그린다. 빈 껍데기만 두면 파이프라인이 68개의 빈 파일을 성공적으로
 * 만들어 놓고 초록불을 켠다 — 규칙 10 이 경고하는 실패 형태 그대로다.
 */

import type { AppData } from '../data/index.ts';
import { freshnessOfSource } from '../lib/freshness.ts';

interface ScreenProps {
  data: AppData;
  today: string;
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

export { Calendar } from './Calendar.tsx';
export { Exams } from './Exams.tsx';
export { Home } from './Home.tsx';
export { ExamDetail } from './ExamDetail.tsx';
export { NotFound } from './NotFound.tsx';
