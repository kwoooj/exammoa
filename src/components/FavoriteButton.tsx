import { Star } from '@phosphor-icons/react';
import { useFavorites } from '../lib/favorites.ts';

interface Props {
  slug: string;
  name: string;
  className?: string;
}

export function FavoriteButton({ slug, name, className }: Props) {
  const { favorites, toggle } = useFavorites();
  const active = favorites.includes(slug);

  return (
    <button
      type="button"
      className={['favorite', active ? 'favorite--active' : '', className ?? ''].filter(Boolean).join(' ')}
      onClick={() => toggle(slug)}
      aria-pressed={active}
      aria-label={`${name} ${active ? '관심 시험에서 삭제' : '관심 시험에 추가'}`}
      title={active ? '관심 시험에서 삭제' : '관심 시험에 추가'}
    >
      <Star size={20} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
    </button>
  );
}
