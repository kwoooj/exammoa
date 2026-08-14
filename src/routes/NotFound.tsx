/**
 * S-07 찾을 수 없음. 화면정의 §11.
 *
 * 존재하지 않는 slug 를 다른 시험으로 자동 이동시키지 않는다. 비슷한 이름의 시험을
 * 대신 보여주면 사용자는 자기가 찾던 시험의 일정을 본 것으로 착각한다.
 *
 * 운영 오류 코드나 원본 JSON 을 노출하지 않는다.
 */

import { ROUTE_PATHS } from '../lib/routes.ts';
import { Link } from '../router/Link.tsx';

export function NotFound() {
  return (
    <section className="section section--lead">
      <h1>요청한 시험 정보를 찾지 못했어요</h1>
      <p className="lede">주소가 바뀌었거나 아직 다루지 않는 시험일 수 있어요.</p>
      <p className="row">
        <Link to={ROUTE_PATHS.exams} className="btn btn--primary">전체 시험 보기</Link>
        <Link to={ROUTE_PATHS.home} className="btn">홈으로</Link>
      </p>
    </section>
  );
}
