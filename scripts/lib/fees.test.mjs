import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFeeSeed, collectFees, pageContainsFee, parseQnetFee } from './fees.mjs';

const qnetHtml = `<table><caption>필기, 실기 항목순으로 수수료 안내표</caption>
  <tr><th>필기</th><th>실기</th></tr><tr><td>19,400원</td><td>22,600원</td></tr></table>`;

test('Q-Net 수수료 표를 파싱한다', () => {
  assert.deepEqual(parseQnetFee(qnetHtml), [
    { label: '필기', amount: 19400 },
    { label: '실기', amount: 22600 },
  ]);
});

test('Q-Net 일정표의 필기·실기를 수수료로 오인하지 않는다', () => {
  const schedule = '<table><caption>시험일정 안내표</caption><tr><th>필기시험</th><th>실기시험</th></tr><tr><td>2026.01.01</td><td>2026.02.01</td></tr></table>';
  assert.equal(parseQnetFee(schedule + qnetHtml)?.[0].amount, 19400);
});

test('공식 페이지 fingerprint는 쉼표와 공백 차이를 허용한다', () => {
  const record = { items: [{ label: '일반', amount: 84000 }], source: { kind: 'page' } };
  assert.equal(pageContainsFee('<p>응시료 84,000 원</p>', record), true);
  assert.equal(pageContainsFee('<p>응시료 90,000원</p>', record), false);
});

test('Q-Net 인상 금액을 자동 반영하고 변경을 기록한다', async () => {
  const exams = [{ slug: '정보처리기사', jmCd: '1320', tier: 'T1' }];
  const seed = { fees: [{ slug: '정보처리기사', items: [{ label: '필기', amount: 18000 }, { label: '실기', amount: 20000 }], checkedAt: '2026-01-01', source: { kind: 'qnet' } }] };
  const result = await collectFees(exams, seed, {
    now: '2026-08-19T00:00:00Z',
    fetchImpl: async () => new Response(qnetHtml, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }),
  });
  assert.equal(result.exams[0].fee.items[0].amount, 19400);
  assert.equal(result.exams[0].fee.checkedAt, '2026-08-19');
  assert.equal(result.changes.length, 1);
});

test('확인 실패 시 직전 게시 금액을 유지한다', async () => {
  const exams = [{ slug: '시험', jmCd: '0001', tier: 'T1' }];
  const seed = { fees: [{ slug: '시험', items: [{ label: '필기', amount: 10000 }], checkedAt: '2026-01-01', source: { kind: 'qnet' } }] };
  const previousExams = [{ slug: '시험', fee: { items: [{ label: '필기', amount: 12000 }], checkedAt: '2026-08-18' } }];
  const result = await collectFees(exams, seed, { previousExams, fetchImpl: async () => { throw new Error('network down'); } });
  assert.equal(result.exams[0].fee.items[0].amount, 12000);
  assert.equal(result.failures.length, 1);
});

test('응시료 시드는 모든 노출 시험을 요구한다', () => {
  const checked = checkFeeSeed({ fees: [] }, [{ slug: '시험', tier: 'T1' }]);
  assert.equal(checked.ok, false);
  assert.match(checked.problems.join('\n'), /응시료가 없다/);
});

test('공식 무료 시험은 0원 응시료를 허용한다', () => {
  const checked = checkFeeSeed({
    fees: [{
      slug: '기관시험', items: [{ label: '기관 부담', amount: 0 }], checkedAt: '2026-08-20',
      source: { kind: 'manual', url: 'https://example.com', recheckAfterDays: 90 },
    }],
  }, [{ slug: '기관시험', tier: 'T3' }]);
  assert.equal(checked.ok, true, checked.problems.join('\n'));
});

test('접수처별 가변 응시료는 설명형 값으로 보존한다', () => {
  const checked = checkFeeSeed({
    fees: [{
      slug: '국제시험', items: [{ label: '응시료', amountLabel: '시험센터·접수 국가별 확인' }], checkedAt: '2026-08-20',
      source: { kind: 'manual', url: 'https://example.com', recheckAfterDays: 30 },
    }],
  }, [{ slug: '국제시험', tier: 'T3' }]);
  assert.equal(checked.ok, true, checked.problems.join('\n'));
});
