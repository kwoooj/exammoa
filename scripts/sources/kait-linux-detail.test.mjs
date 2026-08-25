import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKaitLinuxDetail } from './kait-linux-detail.mjs';

const source = {
  id: 'kait-linux-detail',
  authority: '한국정보통신진흥협회(KAIT)',
  sourceUrl: 'https://kait.or.kr/user/MainMenuList.do?cateSeq=5&menuSeq=119',
  examSlugs: ['리눅스마스터1급', '리눅스마스터2급'],
};

const fixture = `
<table>
  <tr><th>등급</th><th>차수</th><th>검정방법</th><th>문항수</th><th>시험시간</th><th>합격</th></tr>
  <tr><td rowspan="3">1급</td><td>1차</td><td>필기(객관식)</td><td>100문항</td><td>100분</td><td>60점 이상 (과목당 40% 미만 과락)</td></tr>
  <tr><td rowspan="2">2차</td><td>필기(40%)(단답식, 서술식)</td><td>10문항</td><td rowspan="2">100분</td><td rowspan="2">60점 이상</td></tr>
  <tr><td>실기(60%)(작업식)</td><td>5~7문항</td></tr>
  <tr><td rowspan="2">2급</td><td>1차</td><td>온라인시험(객관식)</td><td>50문항</td><td>60분</td><td>60점 이상</td></tr>
  <tr><td>2차</td><td>필기(객관식)</td><td>80문항</td><td>100분</td><td>60점 이상(과목당 40% 미만 과락)</td></tr>
</table>
<table>
  <tr><th>종목</th><th>과목</th><th>검정항목</th></tr>
  <tr><td rowspan="3">1급</td><td>리눅스 실무의 이해</td><td>리눅스의 개요</td></tr>
  <tr><td>리눅스 시스템 관리</td><td>일반 운영관리</td></tr>
  <tr><td>네트워크 및 서비스의 활용</td><td>네트워크 서비스</td></tr>
  <tr><td rowspan="3">2급</td><td>리눅스 일반</td><td>리눅스의 이해</td></tr>
  <tr><td>리눅스 운영 및 관리</td><td>파일 시스템</td></tr>
  <tr><td>리눅스 활용</td><td>X윈도우</td></tr>
</table>`;

test('1급 2차의 필기·실기 문항과 배점을 한 제한시간에 묶는다', () => {
  const result = parseKaitLinuxDetail(fixture, { source, observedAt: '2026-08-25T00:00:00.000Z' });
  assert.deepEqual(result.diagnostics, {
    discovered: 2, included: 2, missing: [], unclassified: [], failures: [],
  });
  const detail = result.details.find(candidate => candidate.examSlug === '리눅스마스터1급');
  assert.equal(detail.classification.kind, 'private-accredited');
  assert.deepEqual(detail.formats[0].stages.map(stage => stage.durationMinutes), [100, 100]);
  assert.equal(detail.formats[0].stages[0].totalItemCount, 100);
  assert.deepEqual(detail.formats[0].stages[1].sections.map(section => section.itemCount), [10, { min: 5, max: 7 }]);
  assert.deepEqual(detail.formats[0].stages[1].sections.map(section => section.scoreRange.max), [40, 60]);
  assert.equal(detail.formats[0].stages[1].timedBlocks, undefined);
});

test('2급 1차 온라인과 2차 시험장 구성을 분리한다', () => {
  const detail = parseKaitLinuxDetail(fixture, { source, observedAt: '2026-08-25T00:00:00.000Z' })
    .details.find(candidate => candidate.examSlug === '리눅스마스터2급');
  assert.deepEqual(detail.formats[0].stages.map(stage => stage.durationMinutes), [60, 100]);
  assert.deepEqual(detail.formats[0].stages.map(stage => stage.totalItemCount), [50, 80]);
  assert.deepEqual(detail.formats[0].stages[0].sections.map(section => section.name), ['리눅스 일반']);
  assert.deepEqual(detail.formats[0].stages[1].sections.map(section => section.name), ['리눅스 운영 및 관리', '리눅스 활용']);
});

test('공식 표 헤더가 바뀌면 전수 후보를 실패시킨다', () => {
  const result = parseKaitLinuxDetail(fixture.replace('검정방법', '시험방식'), {
    source,
    observedAt: '2026-08-25T00:00:00.000Z',
  });
  assert.equal(result.details.length, 0);
  assert.deepEqual(result.diagnostics.missing, source.examSlugs);
  assert.equal(result.diagnostics.failures.length, 1);
});

test('한 급수의 검정방법이 바뀌면 해당 급수를 정상 게시하지 않는다', () => {
  const result = parseKaitLinuxDetail(fixture.replace('실기(60%)(작업식)', '실기(60%)(구술)'), {
    source,
    observedAt: '2026-08-25T00:00:00.000Z',
  });
  assert.deepEqual(result.details.map(detail => detail.examSlug), ['리눅스마스터2급']);
  assert.deepEqual(result.diagnostics.missing, ['리눅스마스터1급']);
  assert.match(result.diagnostics.failures[0], /1급 2차/);
});

test('공식 과목이 빠지거나 새 급수가 생기면 무음 제외하지 않는다', () => {
  const missingSubject = parseKaitLinuxDetail(fixture.replace('리눅스 시스템 관리', '리눅스 실무의 이해'), {
    source,
    observedAt: '2026-08-25T00:00:00.000Z',
  });
  assert.deepEqual(missingSubject.diagnostics.missing, ['리눅스마스터1급']);
  assert.match(missingSubject.diagnostics.failures[0], /검정 과목 불일치/);

  const newGrade = fixture.replace('</table>\n<table>', '<tr><td>3급</td><td>1차</td><td>필기(객관식)</td><td>20문항</td><td>40분</td><td>60점 이상</td></tr></table>\n<table>');
  const unclassified = parseKaitLinuxDetail(newGrade, { source, observedAt: '2026-08-25T00:00:00.000Z' });
  assert.equal(unclassified.diagnostics.discovered, 3);
  assert.deepEqual(unclassified.diagnostics.unclassified, ['3급']);
});
