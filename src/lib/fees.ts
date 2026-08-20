import type { Exam } from '../types.ts';

const won = new Intl.NumberFormat('ko-KR');

/** 목록에서 빠르게 비교할 수 있는 한 줄 응시료. 미확인 금액은 만들지 않는다. */
export function feeLabel(exam: Exam): string | null {
  if (!exam.fee?.items.length) return null;
  return exam.fee.items
    .map(item => item.amount === 0 ? `${item.label} 무료` : `${item.label} ${won.format(item.amount)}원`)
    .join(' · ');
}

/** 2026-08-19 → 2026.08 확인 */
export function feeCheckedLabel(exam: Exam): string | null {
  if (!exam.fee) return null;
  return `${exam.fee.checkedAt.slice(0, 7).replace('-', '.')} 확인`;
}
