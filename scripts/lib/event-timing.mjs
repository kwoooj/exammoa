// 일정 원본이 날짜만 주고, 기관이 별도 공통 안내에서 시각 규칙을 공지하는 경우의 메타데이터.
// 화면에서 빈칸을 임의 시각으로 채우지 않고, 확정 시각과 개인별로 달라지는 시각을 구분한다.

export const SEOUL_TIMEZONE = 'Asia/Seoul';

/**
 * Q-Net 국가기술자격 공통 규칙.
 * - 원서접수: 첫날 10:00 ~ 마지막 날 18:00
 * - 합격자 발표: 발표일 09:00
 * - 시험: 접수 직후 배정/선택한 수험일시를 수험표로 통보하므로 연간 일정에서 단일 시각 확정 불가
 */
export function qnetEventTiming(kind) {
  if (kind === 'reg') {
    return { start: '10:00', end: '18:00', timezone: SEOUL_TIMEZONE, status: 'confirmed' };
  }
  if (kind === 'result') {
    return { start: '09:00', timezone: SEOUL_TIMEZONE, status: 'confirmed' };
  }
  if (kind === 'exam') {
    return {
      timezone: SEOUL_TIMEZONE,
      status: 'varies',
      note: '접수한 시험장·일시에 따라 다름 · 수험표 확인',
    };
  }
  return null;
}

