/**
 * 캘린더 막대의 색 배정.
 *
 * 화면정의 §13.1 은 액센트를 "공식 링크와 활성 필터" 에만 쓰라고 했다. 그 규칙을
 * 지키면서도 캘린더가 읽히게 하려면 **색이 무엇을 말하는지**를 먼저 정해야 한다.
 *
 *   모양 = 일정 종류 (접수 테두리 · 추가접수 점선 · 시험 채움 · 발표 점선 원)
 *   색   = 어느 시험의 일정인가
 *
 * 둘을 겹치지 않게 나눈 이유가 있다. 색으로 종류를 구분하면 §3.2 의 "색상만으로
 * 상태를 구분하지 않는다" 를 어기게 되고, 색맹 사용자와 흑백 인쇄에서 접수와
 * 시험이 같아진다. 모양은 그대로 두고 색을 **종목 구분**에만 쓰면 두 정보가 서로
 * 독립적으로 살아 있다.
 *
 * **시행그룹이 하나뿐이면 색을 쓰지 않는다.** 시험 상세(S-03)처럼 한 시험만 있는
 * 화면에서 색은 아무것도 구분하지 못한다. 구분하지 않는 색은 장식이고, §13.2 가
 * 금지한 쪽이다. 그럴 때는 잉크 계열로 그린다.
 *
 * 색 수를 6으로 맞춘 것은 통합 캘린더가 최대 6개까지 담기 때문이다 (§8.3).
 * 그보다 많아지는 전체 일정 모드에서는 색이 돌아 반복되는데, 그 화면의 색은
 * "이 막대들은 한 덩어리다" 정도만 말하면 된다 — 정확한 식별은 라벨이 한다.
 */

/** 팔레트 크기. 통합 캘린더의 최대 선택 수와 같다 */
export const PALETTE_SIZE = 6;

/** 색을 쓰지 않는다는 뜻 */
export const NEUTRAL = null;

export type ColorIndex = number | typeof NEUTRAL;

/**
 * 그룹마다 색 번호를 준다. 그룹이 하나뿐이면 전부 중립색이다.
 *
 * 배정은 **넘겨받은 순서**를 따른다. 해시를 쓰면 두 그룹이 같은 색을 받는 사고가
 * 나고, 그때 화면에서는 서로 다른 시험이 한 시험처럼 보인다.
 */
export function assignColors(groupIds: readonly string[]): Map<string, ColorIndex> {
  const unique: string[] = [];
  for (const id of groupIds) if (!unique.includes(id)) unique.push(id);

  const out = new Map<string, ColorIndex>();
  if (unique.length <= 1) {
    for (const id of unique) out.set(id, NEUTRAL);
    return out;
  }
  unique.forEach((id, i) => out.set(id, i % PALETTE_SIZE));
  return out;
}

/** 막대에 붙일 클래스 조각. 중립이면 빈 문자열 */
export function colorClass(index: ColorIndex): string {
  return index === NEUTRAL ? '' : `cal__bar--c${index + 1}`;
}
