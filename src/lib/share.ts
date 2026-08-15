/**
 * 계획을 담은 링크 만들기와 복사.
 *
 * `?p=` 인코딩은 `urlState.ts` 가 정본이다. 여기서는 그것을 주소로 조립하고
 * 클립보드에 넣는 일만 한다.
 */

import type { ExamPlan, Session } from '../types.ts';
import { encodePlans } from './urlState.ts';

/**
 * 주소창을 읽지 않고 **계획에서 다시 만든다.**
 *
 * `persist()` 는 복원 직후에는 돌지 않는다 (App 의 hydrated 가드 — 깨진 링크가 저장
 * 상태를 지우는 것을 막는다). 그래서 localStorage 로 복원한 첫 화면에서는 주소창에
 * `?p=` 가 없다. 그때 `location.href` 를 복사하면 **계획이 빠진 빈 링크가 공유된다.**
 */
export function planUrl(plans: ExamPlan[], sessions: Session[]): string {
  const url = new URL(window.location.href);
  const encoded = encodePlans(plans, sessions);
  if (encoded) url.searchParams.set('p', encoded);
  else url.searchParams.delete('p');
  return url.toString();
}

/**
 * 클립보드 API 는 보안 컨텍스트(https·localhost)에서만 동작하고 권한 거부도 있다.
 * 실패를 삼키지 않고 폴백까지 시도한 뒤 성공 여부를 돌려준다 — 화면이 복사되지도
 * 않은 것을 "복사했어요" 라고 말하면 안 된다.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 폴백으로 내려간다 */
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  // 화면 밖에 두되 readOnly 로 만든다. iOS 는 보이지 않는 요소를 선택하지 못한다.
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '-1000px';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  try {
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(ta);
  }
}
