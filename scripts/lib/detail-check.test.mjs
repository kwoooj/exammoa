import test from 'node:test';
import assert from 'node:assert/strict';
import { checkExamDetails } from './detail-check.mjs';

const detail = {
  examSlug: '시험', catalogStatus: 'published',
  sourceRefs: ['official'],
  classification: { kind: 'institutional-assessment', label: '기관 평가시험', authority: '기관', sourceUrl: 'https://example.com', checkedAt: '2026-08-20' },
  result: { type: 'score', label: '점수제' }, deliveryModes: ['시험장'],
  formats: [{ effectiveFrom: '2026-01-01', checkedAt: '2026-08-20', sourceUrl: 'https://example.com', stages: [{ id: 'one', name: '시험', sections: [{ name: '영역' }] }] }],
};

test('검증된 공개 상세를 허용한다', () => {
  assert.equal(checkExamDetails({ details: [detail] }, ['시험']).ok, true);
});

test('공개 시험 전수 게이트는 누락 상세를 막는다', () => {
  const result = checkExamDetails({ details: [detail] }, ['시험', '누락'], { requireAllPublished: true });
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /누락: 공개 시험 상세가 없다/);
});

test('출처 레지스트리가 주어지면 상세 출처 참조를 검증한다', () => {
  assert.equal(checkExamDetails({ details: [detail] }, ['시험'], { sourceIds: new Set(['official']) }).ok, true);
  const missing = structuredClone(detail);
  missing.sourceRefs = [];
  assert.match(
    checkExamDetails({ details: [missing] }, ['시험'], { sourceIds: new Set(['official']) }).problems.join('\n'),
    /sourceRefs가 비었다/,
  );
  const unknown = structuredClone(detail);
  unknown.sourceRefs = ['unknown'];
  assert.match(
    checkExamDetails({ details: [unknown] }, ['시험'], { sourceIds: new Set(['official']) }).problems.join('\n'),
    /등록되지 않은 상세 출처/,
  );
});

test('가변 시간 범위의 역전을 막는다', () => {
  const bad = structuredClone(detail);
  bad.formats[0].stages[0].durationMinutes = { min: 80, max: 60 };
  assert.match(checkExamDetails({ details: [bad] }, ['시험']).problems.join('\n'), /단계 전체 시간/);
});

test('문항 수와 배점 범위의 잘못된 값을 막는다', () => {
  const bad = structuredClone(detail);
  bad.formats[0].stages[0].sections[0].itemCount = 0;
  bad.formats[0].stages[0].sections[0].scoreRange = { min: 100, max: 10 };
  const problems = checkExamDetails({ details: [bad] }, ['시험']).problems.join('\n');
  assert.match(problems, /문항·과제 수/);
  assert.match(problems, /과목 배점 범위/);
});

test('강제 진행 구간은 실제 과목을 참조하고 전체 시간과 일치해야 한다', () => {
  const bad = structuredClone(detail);
  bad.formats[0].stages[0].durationMinutes = 60;
  bad.formats[0].stages[0].timedBlocks = [
    { name: '듣기', durationMinutes: 20, sectionNames: ['없는 과목'] },
    { name: '읽기', durationMinutes: 20 },
  ];
  const problems = checkExamDetails({ details: [bad] }, ['시험']).problems.join('\n');
  assert.match(problems, /없는 과목을 참조/);
  assert.match(problems, /구간 합계가 단계 전체 시간과 다르다/);
});

test('동시에 적용되는 구성 버전을 막는다', () => {
  const bad = structuredClone(detail);
  bad.formats.push({ ...structuredClone(bad.formats[0]), effectiveFrom: '2026-08-01' });
  assert.match(checkExamDetails({ details: [bad] }, ['시험']).problems.join('\n'), /구성 적용 기간이 겹친다/);
});
