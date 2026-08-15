/**
 * 아이콘. 1.5px 아웃라인 한 종류만 쓰고 이모지는 쓰지 않는다.
 *
 * 색은 언제나 `currentColor` 다 — 경고 아이콘이 경고 색을 스스로 알면, 나중에 같은
 * 아이콘을 다른 맥락에 놓을 때 색이 따라와서 액센트 예산이 조용히 새어 나간다.
 */

interface IconProps {
  size?: number;
}

export function WarnIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="icon">
      <path
        d="M12 8.5v4.2M12 16.2h.01M10.3 3.9 2.6 17.2a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LinkIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="icon">
      <path
        d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.4M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.3-1.3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
