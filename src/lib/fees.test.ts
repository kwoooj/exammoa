import assert from 'node:assert/strict';
import test from 'node:test';
import type { Exam } from '../types.ts';
import { feeCheckedLabel, feeLabel } from './fees.ts';

const exam = (fee?: Exam['fee']): Exam => ({
  slug: '정보처리기사', name: '정보처리기사', short: '정처기', groupId: 'hrdk-regular',
  jmCd: '1320', qualgbCd: 'T', series: '기사', category: 'it', tier: 'T1', priority: 1, fee,
});

test('필기·실기 응시료를 원 단위 한 줄로 표시한다', () => {
  const target = exam({
    items: [{ label: '필기', amount: 19400 }, { label: '실기', amount: 22600 }],
    checkedAt: '2026-08-19',
  });
  assert.equal(feeLabel(target), '필기 19,400원 · 실기 22,600원');
  assert.equal(feeCheckedLabel(target), '2026.08 확인');
});

test('확인하지 않은 응시료는 추정하지 않는다', () => {
  assert.equal(feeLabel(exam()), null);
  assert.equal(feeCheckedLabel(exam()), null);
});
