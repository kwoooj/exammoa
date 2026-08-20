/**
 * 링크. 내부 이동과 외부 이동을 각각 한 곳에서만 만든다.
 *
 * `Link` 는 **언제나 진짜 `<a href>` 를 낸다.** 사전 렌더한 HTML 이 크롤 가능해야
 * 하고(§1.2 검색 유입), 가운데 클릭·새 탭·주소 복사가 그냥 돼야 한다. 클릭을
 * 가로채는 것은 같은 창에서의 평범한 왼쪽 클릭뿐이다.
 *
 * `ExternalLink` 는 §4.2 와 §14 를 한 자리에 모은다 — 새 창, `rel`, 그리고 어느
 * 기관의 무엇으로 가는지 미리 알리는 접근성 이름. 세 곳에서 각자 `target="_blank"`
 * 를 적으면 그중 하나는 반드시 `rel` 을 빠뜨리고, 또 하나는 "링크" 라고만 읽힌다.
 */

import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { isInternalHref } from '../lib/routes.ts';
import { useNavigate } from './Router.tsx';
import type { NavigateOptions } from './Router.tsx';
import type { OfficialLink } from '../lib/links.ts';
import { ArrowUpRight } from '@phosphor-icons/react';

type AnchorProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>;

export interface LinkProps extends AnchorProps, NavigateOptions {
  to: string;
  children: ReactNode;
}

/** 브라우저에게 맡겨야 하는 클릭인가 */
function isModified(e: MouseEvent<HTMLAnchorElement>): boolean {
  return e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}

export function Link({ to, replace, scroll, children, onClick, target, ...rest }: LinkProps) {
  const go = useNavigate();

  return (
    <a
      href={to}
      target={target}
      onClick={e => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        // 새 탭·다른 창으로 가는 클릭은 브라우저가 하게 둔다.
        if (isModified(e) || target || !isInternalHref(to)) return;
        e.preventDefault();
        go(to, { ...(replace !== undefined ? { replace } : {}), ...(scroll !== undefined ? { scroll } : {}) });
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

export interface ExternalLinkProps extends AnchorProps {
  href: string;
  /** 접근성 이름. `한국산업인력공단 정보처리기사 원서접수 새 창 열기` (§4.2) */
  label: string;
  children: ReactNode;
}

export function ExternalLink({ href, label, children, className, ...rest }: ExternalLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      // noopener 는 보안, noreferrer 는 기관 로그에 우리 주소를 남기지 않기 위해서다.
      rel="noopener noreferrer"
      aria-label={label}
      // 액센트는 기관으로 나가는 링크에만 쓴다 (§13.1). 내부 링크는 잉크색이다.
      className={className ? `extlink ${className}` : 'extlink'}
      {...rest}
    >
      {children}
      <ArrowUpRight size={14} aria-hidden="true" className="extlink__icon" />
    </a>
  );
}

/**
 * 공식 링크 버튼. 주소가 없으면 **비활성 버튼이 아니라 안내 문구**를 낸다 (§4.2).
 *
 * 비활성 버튼을 두면 §15.3 이 경고한 오해가 생긴다 — 링크가 없는 상태를 접수
 * 마감으로 읽는다. 눌리지 않는 '원서접수' 버튼은 "접수가 끝났다" 로 보인다.
 */
export function OfficialLinkButton({ link, className }: { link: OfficialLink; className?: string }) {
  if (!link.href) return <span className="muted small">{link.label}</span>;
  return (
    <ExternalLink href={link.href} label={link.a11yLabel} className={className}>
      {link.label}
    </ExternalLink>
  );
}
