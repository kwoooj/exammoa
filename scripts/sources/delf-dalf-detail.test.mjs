import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [detailsSeed, feesSeed, sourcesSeed] = await Promise.all([
  readFile('data/exam-details.seed.json', 'utf8').then(JSON.parse),
  readFile('data/fees.seed.json', 'utf8').then(JSON.parse),
  readFile('data/detail-sources.seed.json', 'utf8').then(JSON.parse),
]);
const slugs = ['DELF-A1', 'DELF-A2', 'DELF-B1', 'DELF-B2', 'DALF-C1', 'DALF-C2'];
const detailFor = slug => detailsSeed.details.find(detail => detail.examSlug === slug);
const feeFor = slug => feesSeed.fees.find(fee => fee.slug === slug);

test('DELF A1~B2는 단체 시험과 개인 구술을 분리하고 준비시간을 순수 시험시간에서 제외한다', () => {
  const collective = [80, 100, 115, 150];
  const oral = [{ min: 5, max: 7 }, { min: 6, max: 8 }, 15, 20];
  slugs.slice(0, 4).forEach((slug, index) => {
    const format = detailFor(slug).formats[0];
    assert.equal(format.stages[0].durationMinutes, collective[index]);
    assert.deepEqual(format.stages[1].durationMinutes, oral[index]);
    assert.match(format.stages[1].note, /준비시간/);
    assert.equal(format.stages[0].sections[0].taskCount, undefined);
    assert.equal(detailFor(slug).result.validityLabel, '유효기간 없음');
  });
});

test('DALF C1·C2는 공식 통합 방식·시간·배점과 과락 기준을 구분한다', () => {
  const c1 = detailFor('DALF-C1');
  const c2 = detailFor('DALF-C2');
  assert.equal(c1.formats[0].totalDurationMinutes, 270);
  assert.deepEqual(c1.formats[0].stages[0].timedBlocks.map(block => block.durationMinutes), [40, 50, 150]);
  assert.match(c1.result.passCriteria, /각각 5점/);
  assert.equal(c2.formats[0].totalDurationMinutes, 240);
  assert.deepEqual(c2.formats[0].stages.map(stage => stage.durationMinutes), [210, 30]);
  assert.deepEqual(c2.formats[0].stages.map(stage => stage.sections[0].scoreRange.max), [50, 50]);
  assert.match(c2.result.passCriteria, /각각 10점/);
});

test('공식 확인이 막힌 현행 응시료는 상충하는 보조 출처 숫자를 추정하지 않는다', () => {
  for (const slug of slugs) {
    const fee = feeFor(slug);
    assert.equal(fee.items[0].amount, undefined);
    assert.match(fee.items[0].amountLabel, /공식 접수 화면/);
    assert.match(fee.note, /공식 총괄센터/);
  }
  const source = sourcesSeed.sources.find(candidate => candidate.id === 'delf-dalf-levels-format');
  assert.ok(source.sourceUrls.every(url => url.includes('france-education-international.fr') || url.includes('delf-dalf.co.kr')));
});
