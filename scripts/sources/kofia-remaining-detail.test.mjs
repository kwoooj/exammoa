import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const details = JSON.parse(await readFile('data/exam-details.seed.json', 'utf8')).details;
const detail = slug => details.find(candidate => candidate.examSlug === slug);
const targets = ['증권투자권유자문인력', '펀드투자권유자문인력', '파생상품투자권유자문인력', '증권투자권유대행인', '펀드투자권유대행인', '금융투자분석사', '재무위험관리사'];

test('KOFIA 7종은 과목별 시간을 추정하지 않고 전체 120분·100문항을 보존한다', () => {
  for (const slug of targets) {
    const target = detail(slug);
    const stage = target.formats[0].stages[0];
    assert.equal(target.formats[0].totalDurationMinutes, 120);
    assert.equal(stage.totalItemCount, 100);
    assert.equal(stage.sections.reduce((sum, section) => sum + section.itemCount, 0), 100);
    assert.equal(stage.timedBlocks, undefined);
    assert.match(stage.note, /시험시간은 통합/);
    assert.equal(target.classification.kind, 'private-registered');
  }
});

test('자문인력·대행인·전문자격의 서로 다른 과락과 전체 합격선을 보존한다', () => {
  assert.match(detail('증권투자권유자문인력').result.passCriteria, /50%.*70%/);
  assert.match(detail('증권투자권유대행인').result.passCriteria, /40%.*60%/);
  assert.match(detail('금융투자분석사').result.passCriteria, /40%.*70%/);
  assert.match(detail('재무위험관리사').result.note, /리스크관리기법 14문항/);
});
