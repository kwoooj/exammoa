import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKorchamDetailBundle } from './korcham-detail.mjs';

const source = {
  id: 'korcham-qualification-detail',
  authority: '대한상공회의소',
  sourceUrl: 'https://license.korcham.net/co/examguide.do?cd=0103&mm=21',
  examSlugs: ['컴퓨터활용능력1급', '컴퓨터활용능력2급', '워드프로세서'],
};

const computer = `
<table>
  <tr><th>등급</th><th>시험방법</th><th>시험과목</th><th>출제형태</th><th>시험시간</th></tr>
  <tr><td rowspan="2">1급</td><td>필기시험</td><td>컴퓨터 일반<br>스프레드시트 일반<br>데이터베이스 일반</td><td>객관식 60문항</td><td>60분</td></tr>
  <tr><td>실기시험</td><td>스프레드시트 실무<br>데이터베이스 실무</td><td>컴퓨터 작업형</td><td>90분 (과목별 45분)</td></tr>
  <tr><td rowspan="2">2급</td><td>필기시험</td><td>컴퓨터 일반<br>스프레드시트 일반</td><td>객관식 40문항</td><td>40분</td></tr>
  <tr><td>실기시험</td><td>스프레드시트 실무</td><td>컴퓨터 작업형</td><td>40분</td></tr>
</table>
필기 : 매과목 100점 만점에 과목당 40점 이상이고 평균 60점 이상
실기 : 100점 만점에 70점 이상(1급은 두과목 모두 70점 이상)
필기 : 20,500원 실기 : 25,000원`;

const word = `
<table>
  <tr><th>등급</th><th>시험방법</th><th>시험과목</th><th>출제형태</th><th>시험시간</th></tr>
  <tr><td rowspan="2">단일등급 (구 1급)</td><td>필기시험</td><td>워드프로세싱 용어 및 기능<br>PC 운영체제<br>PC 기본상식</td><td>객관식 60문항</td><td>60분</td></tr>
  <tr><td>실기시험</td><td>문서편집 기능</td><td>컴퓨터 작업형</td><td>30분</td></tr>
</table>
필기 : 매과목 100점 만점에 과목당 40점 이상이고 평균 60점 이상
실기 : 100점 만점에 80점 이상
필기 : 19,000원 실기 : 22,000원`;

const bundle = () => ({ pages: [
  { page: 'computer', url: 'https://example.com/computer', html: computer },
  { page: 'word', url: 'https://example.com/word', html: word },
] });

test('대한상공회의소 3종을 전수 발견하고 과목별 비강제 시간을 단계 전체로 묶는다', () => {
  const result = parseKorchamDetailBundle(bundle(), { source, observedAt: '2026-08-25T00:00:00.000Z' });
  assert.deepEqual(result.diagnostics, { discovered: 3, included: 3, missing: [], unclassified: [], failures: [] });
  const first = result.details.find(detail => detail.examSlug === '컴퓨터활용능력1급');
  assert.equal(first.classification.label, '국가기술자격');
  assert.equal(first.formats[0].stages[0].totalItemCount, 60);
  assert.equal(first.formats[0].stages[0].sections.every(section => section.itemCount === undefined), true);
  assert.deepEqual(first.formats[0].stages[1].timedBlocks.map(block => block.durationMinutes), [45, 45]);
  const wordDetail = result.details.find(detail => detail.examSlug === '워드프로세서');
  assert.equal(wordDetail.formats[0].stages[0].durationMinutes, 60);
  assert.equal(wordDetail.formats[0].stages[1].totalScore, 100);
});

test('공식 문항·시간·응시료 지문이 바뀌면 같은 페이지 종목을 정상 게시하지 않는다', () => {
  const changed = bundle();
  changed.pages[0].html = changed.pages[0].html.replace('객관식 40문항', '객관식 50문항');
  const result = parseKorchamDetailBundle(changed, { source, observedAt: '2026-08-25T00:00:00.000Z' });
  assert.deepEqual(result.details.map(detail => detail.examSlug), ['워드프로세서']);
  assert.deepEqual(result.diagnostics.missing, ['컴퓨터활용능력1급', '컴퓨터활용능력2급']);
  assert.match(result.diagnostics.failures.join('\n'), /컴퓨터활용능력2급.*지문 불일치/);
});

test('새 급수와 공식 원문 페이지 누락을 무음 제외하지 않는다', () => {
  const changed = bundle();
  changed.pages[0].html = changed.pages[0].html.replace('</table>', '<tr><td>3급</td><td>필기시험</td><td>컴퓨터 일반</td><td>객관식 20문항</td><td>20분</td></tr></table>');
  changed.pages = changed.pages.filter(page => page.page !== 'word');
  const result = parseKorchamDetailBundle(changed, { source, observedAt: '2026-08-25T00:00:00.000Z' });
  assert.ok(result.diagnostics.unclassified.includes('컴퓨터활용능력3급'));
  assert.ok(result.diagnostics.missing.includes('워드프로세서'));
  assert.match(result.diagnostics.failures.join('\n'), /word: 공식 시험안내 원문이 없다/);
});
