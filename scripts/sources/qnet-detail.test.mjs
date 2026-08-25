import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectQnetDetails, parseQnetDetailBundle, parseQnetPage, qnetMethodDocument } from './qnet-detail.mjs';

const source = {
  id: 'qnet-qualification-detail',
  authority: '한국산업인력공단',
  examSlugs: ['정보처리기사'],
};
const url = 'https://www.q-net.or.kr/crf005.do?id=crf00503s02&jmCd=1320';

function pageOf(body, examSlug = '정보처리기사') {
  const titled = `<title>${examSlug} 취득방법</title>${body}`;
  const titledEncoded = titled.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return { examSlug, jmCd: '1320', url, html: `<textarea class="hidden" id="contents_text_1">${titledEncoded}</textarea>` };
}

const informationProcessing = `
  <p>③ 시험과목</p>
  <p>- 필기 1. 소프트웨어설계 2. 소프트웨어개발 3. 데이터베이스구축 4. 프로그래밍언어활용 5. 정보시스템구축관리</p>
  <p>- 실기 : 정보처리 실무</p>
  <p>④ 검정방법</p>
  <p>- 필기 : 객관식 4지 택일형, 과목당 20문항(과목당 30분)</p>
  <p>- 실기 : 필답형(2시간30분)</p>
  <p>⑤ 합격기준</p>
  <p>- 필기 : 100점을 만점으로 하여 과목당 40점 이상, 전과목 평균 60점 이상.</p>
  <p>- 실기 : 100점을 만점으로 하여 60점 이상.</p>`;

test('숨은 취득방법 textarea의 HTML 엔티티를 복원한다', () => {
  assert.match(qnetMethodDocument(pageOf(informationProcessing).html), /정보처리 실무/);
});

test('공개문제 뒤로 밀린 취득방법도 textarea 번호가 아니라 문서 내용으로 찾는다', () => {
  const actual = pageOf(informationProcessing).html.replace(
    'id="contents_text_1"',
    'id="contents_text_2"',
  ).replace('<textarea', '<textarea id="contents_text_1">공개문제</textarea><textarea');
  assert.match(qnetMethodDocument(actual), /소프트웨어설계/);
});

test('jmCd가 다른 종목의 문서를 반환하면 이름 대조에서 실패한다', () => {
  const wrong = pageOf(informationProcessing);
  wrong.html = wrong.html.replace('정보처리기사 취득방법', '전기기사 취득방법');
  assert.throws(() => parseQnetPage(wrong, { source, checkedAt: '2026-08-25' }), /종목명 불일치/);
});

test('과목별 강제 구간 없이 필기 전체 시간과 실기 전체 시간을 구성한다', () => {
  const detail = parseQnetPage(pageOf(informationProcessing), { source, checkedAt: '2026-08-25' });
  assert.equal(detail.formats[0].totalDurationMinutes, 300);
  assert.equal(detail.formats[0].effectiveFrom, undefined);
  assert.deepEqual(detail.formats[0].stages.map(stage => stage.durationMinutes), [150, 150]);
  assert.equal(detail.formats[0].stages[0].sections.length, 5);
  assert.equal(detail.formats[0].stages[0].sections[0].itemCount, 20);
  assert.equal(detail.formats[0].stages[0].sections[0].scoreRange.max, 100);
  assert.equal(detail.formats[0].stages[0].timedBlocks, undefined);
  assert.equal(detail.formats[0].stages[1].sections[0].name, '정보처리 실무');
  assert.equal(detail.formats[0].stages[1].totalScore, 100);
});

test('필답형과 작업형이 이어지는 실기는 합산한 단계 시간과 전체 배점을 쓴다', () => {
  const body = `
    <p>시험과목</p><p>- 실기 : 조리작업</p>
    <p>검정방법</p><p>- 실기 : 필답형(1시간) 및 작업형(2시간)</p>
    <p>합격기준</p><p>- 실기 : 100점을 만점으로 하여 60점 이상</p>`;
  const detail = parseQnetPage(pageOf(body), { source, checkedAt: '2026-08-25' });
  assert.equal(detail.formats[0].stages[0].durationMinutes, 180);
  assert.equal(detail.formats[0].stages[0].totalScore, 100);
  assert.equal(detail.formats[0].stages[0].sections[0].mode, 'mixed');
});

test('공통 과목·공통 합격기준과 시간 범위를 단계별 구조로 보존한다', () => {
  const body = `
    <p>시험과목 : 정보의 구조와 정보시스템 설계에 관한 사항</p>
    <p>검정방법</p><p>- 필기 : 주관식 논술형(총 400분)</p><p>- 실기 : 구술형 면접(30분 정도)</p>
    <p>합격기준 : 필기·실기 100점을 만점으로 하여 60점 이상</p>`;
  const detail = parseQnetPage(pageOf(body), { source, checkedAt: '2026-08-25' });
  assert.deepEqual(detail.formats[0].stages.map(stage => stage.sections[0].name), [
    '정보의 구조와 정보시스템 설계에 관한 사항',
    '정보의 구조와 정보시스템 설계에 관한 사항',
  ]);
  assert.deepEqual(detail.formats[0].stages.map(stage => stage.totalScore), [100, 100]);
  assert.equal(detail.formats[0].totalDurationMinutes, 430);

  const rangeBody = `
    <p>시험과목</p><p>- 실기 : 제과 실무</p>
    <p>검정방법</p><p>- 실기 : 작업형(2~4시간 정도)</p>
    <p>합격기준 : 필실기 100점을 만점으로 하여 60점 이상</p>`;
  const rangeDetail = parseQnetPage(pageOf(rangeBody), { source, checkedAt: '2026-08-25' });
  assert.deepEqual(rangeDetail.formats[0].stages[0].durationMinutes, { min: 120, max: 240 });
  assert.equal(rangeDetail.formats[0].stages[0].totalScore, 100);
});

test('과목별 배분을 공개하지 않은 전체 문항 수는 단계 단위로 보존한다', () => {
  const body = `
    <p>시험과목</p><p>- 필기 : 1. 전기이론 2. 전기기기 3. 전기설비</p>
    <p>검정방법</p><p>- 필기 : 객관식 4지 택일형 60문항(60분)</p>
    <p>합격기준</p><p>- 필기 : 100점 만점에 60점 이상</p>`;
  const stage = parseQnetPage(pageOf(body), { source, checkedAt: '2026-08-25' }).formats[0].stages[0];
  assert.equal(stage.totalItemCount, 60);
  assert.equal(stage.sections.every(section => section.itemCount === undefined), true);
});

test('등록 시험 누락과 파싱 실패를 진단해 후보 승격을 막는다', () => {
  const parsed = parseQnetDetailBundle({ pages: [pageOf('<p>시험과목</p>')] }, {
    source: { ...source, examSlugs: ['정보처리기사', '전기기사'] },
    observedAt: '2026-08-25T00:00:00.000Z',
  });
  assert.equal(parsed.details.length, 0);
  assert.deepEqual(parsed.diagnostics.missing, ['전기기사']);
  assert.match(parsed.diagnostics.failures[0], /정보처리기사/);
});

test('일시 네트워크 오류만 제한 재시도하고 47종 중 하나라도 끝내 실패하면 전체 수집을 중단한다', async () => {
  let transientCalls = 0;
  const collected = await collectQnetDetails({
    source,
    exams: [{ slug: '정보처리기사', jmCd: '1320' }],
    sourceUrlOf: () => url,
    robotsCache: new Map(),
    sleep: async () => {},
    fetchDetailUrl: async () => {
      transientCalls += 1;
      if (transientCalls < 3) throw new Error('fetch failed');
      return pageOf(informationProcessing).html;
    },
  });
  assert.equal(transientCalls, 3);
  assert.equal(collected.raw.pages.length, 1);

  let permanentCalls = 0;
  await assert.rejects(collectQnetDetails({
    source,
    exams: [{ slug: '정보처리기사', jmCd: '1320' }],
    sourceUrlOf: () => url,
    robotsCache: new Map(),
    sleep: async () => {},
    fetchDetailUrl: async () => {
      permanentCalls += 1;
      throw new Error('HTTP 404');
    },
  }), /정보처리기사: 공식 상세 수집 실패/);
  assert.equal(permanentCalls, 1);
});
