import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const details = JSON.parse(await readFile('data/exam-details.seed.json', 'utf8')).details;
const detail = slug => details.find(candidate => candidate.examSlug === slug);

test('KBI 공개형 13종은 공식 전체 시간·배점·문항·등급 기준을 보존한다', () => {
  assert.deepEqual(detail('여신심사역').formats[0].stages.map(stage => stage.durationMinutes), [80, 170]);
  assert.deepEqual(detail('신용위험분석사-CRA').formats[0].stages.map(stage => stage.durationMinutes), [250, 250]);
  assert.equal(detail('은행텔러').formats[0].totalDurationMinutes, 120);
  assert.equal(detail('영업점컴플라이언스오피서-은행').formats[0].stages[0].totalItemCount, 70);
  assert.equal(detail('자금세탁방지업무능력검정시험').formats[0].stages[0].totalScore, 1000);
  assert.match(detail('KBI금융DT테스트').result.passCriteria, /Gold 90/);
  assert.match(detail('KBI금융AI리터러시').result.passCriteria, /Green 60/);
});

test('위탁 3종은 공개된 60분만 보존하고 미공개 과목을 추정하지 않는다', () => {
  for (const slug of ['농협은행개인여신전문역', '농협은행중소기업심사역', '수협은행직무역량평가-SCA']) {
    const target = detail(slug);
    assert.equal(target.classification.kind, 'commissioned-assessment');
    assert.equal(target.formats[0].totalDurationMinutes, 60);
    assert.equal(target.formats[0].stages[0].sections[0].name, '공식 공개 과목 구성 없음');
    assert.match(target.formats[0].stages[0].note, /추정하지 않습니다/);
  }
});
