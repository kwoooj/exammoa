import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKpcItqDetail } from './kpc-itq-detail.mjs';

const source = {
  id: 'kpc-itq-qualification-detail',
  authority: '한국생산성본부(KPC)',
  sourceUrl: 'https://license.kpc.or.kr/nasec/qlfint/qlfint/selectItqinfotchnlgyqc.do?pageKind=announcement',
  examSlugs: ['ITQ'],
};

const subjects = ['아래한글', '한셀', '한쇼', 'MS워드', '한글엑셀', '한글액세스', '한글파워포인트', '인터넷'];
const fixture = extra => `
등록번호 : 2008-0191 자격종류 : 공인민간자격
<table>
  <tr><th rowspan="2" colspan="2">자격종목(과목)</th><th colspan="2">프로그램 및 버전</th><th rowspan="2">등급</th><th rowspan="2">시험방식</th><th rowspan="2">시험시간</th></tr>
  <tr><th>S/W</th><th>공식버전</th></tr>
  ${[...subjects, ...(extra ? [extra] : [])].map((subject, index) => `<tr><td>${index === 0 ? 'ITQ정보기술자격' : ''}</td><td>${subject}</td><td>프로그램</td><td>2022</td><td>A등급 B등급 C등급</td><td>PBT</td><td>60분</td></tr>`).join('')}
</table>
A등급 400점 ~ 500점 B등급 300점 ~ 399점 C등급 200점 ~ 299점
500점 만점이며 200점 미만은 불합격
일반접수 22,000원 42,000원 60,000원`;

test('ITQ를 선택 과목당 전체 시간·배점으로 통합해 제공한다', () => {
  const result = parseKpcItqDetail(fixture(), { source, observedAt: '2026-08-25T00:00:00.000Z' });
  assert.deepEqual(result.diagnostics, { discovered: 1, included: 1, missing: [], unclassified: [], failures: [] });
  const detail = result.details[0];
  assert.equal(detail.classification.label, '국가공인 민간자격');
  assert.equal(detail.result.type, 'level-awarded');
  assert.equal(detail.formats[0].stages[0].durationMinutes, 60);
  assert.equal(detail.formats[0].stages[0].totalScore, 500);
  assert.deepEqual(detail.formats[0].stages[0].sections.map(section => section.name), subjects);
  assert.equal(detail.formats[0].stages[0].timedBlocks, undefined);
});

test('새 과목이나 등급·응시료 변경은 정상 후보로 통과하지 않는다', () => {
  const newSubject = parseKpcItqDetail(fixture('한글데이터'), { source, observedAt: '2026-08-25T00:00:00.000Z' });
  assert.deepEqual(newSubject.diagnostics.unclassified, ['한글데이터']);
  assert.equal(newSubject.details.length, 0);

  const changedFee = parseKpcItqDetail(fixture().replace('22,000원', '25,000원'), { source, observedAt: '2026-08-25T00:00:00.000Z' });
  assert.equal(changedFee.details.length, 0);
  assert.match(changedFee.diagnostics.failures.join('\n'), /응시료 지문 불일치/);
});
