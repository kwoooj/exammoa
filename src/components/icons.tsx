import { LinkSimple, Warning } from '@phosphor-icons/react';

interface IconProps {
  size?: number;
}

export function WarnIcon({ size = 16 }: IconProps) {
  return <Warning size={size} aria-hidden="true" className="icon" />;
}

export function LinkIcon({ size = 18 }: IconProps) {
  return <LinkSimple size={size} aria-hidden="true" className="icon" />;
}
