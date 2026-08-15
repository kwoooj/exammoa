import { LinkIcon } from './icons.tsx';

interface Props {
  /** 고른 종목 수. 0 이면 개수도 링크 복사도 보여줄 것이 없다 */
  pickedCount: number;
  onCopy: () => void;
}

/**
 * 얇은 고정 헤더.
 *
 * 링크 복사를 여기 두는 이유: `?p=` 공유는 이미 동작했는데 **누를 곳이 없었다.**
 * 계획을 만지는 곳(카드·타임라인)은 페이지 중간이라 어디에 두어도 스크롤 위치에
 * 따라 사라진다. 헤더는 항상 닿는 유일한 자리다.
 */
export function AppHeader({ pickedCount, onCopy }: Props) {
  return (
    <header className="hdr">
      <div className="hdr__inner">
        <span className="hdr__logo">exammoa</span>
        {pickedCount > 0 && (
          <>
            <span className="hdr__count mono">{pickedCount}개 선택</span>
            <button type="button" className="iconbtn" onClick={onCopy} aria-label="이 일정 링크 복사">
              <LinkIcon />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
