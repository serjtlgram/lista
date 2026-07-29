import React from 'react';
import { Item } from '../types';
import { ItemCard } from './ItemCard';
import { Star } from 'lucide-react';
import { Translations } from '../services/i18n';

interface FavoritesSectionProps {
  items: Item[];
  onSeeAll: () => void;
  onSelectItem: (item: Item) => void;
  onToggleStatus?: (item: Item, e: React.MouseEvent) => void;
  t: Translations;
}

export const FavoritesSection: React.FC<FavoritesSectionProps> = ({
  items,
  onSeeAll,
  onSelectItem,
  onToggleStatus,
  t,
}) => {
  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
          <h2 className="text-sm font-bold text-gray-200">{t.favorites.title}</h2>
        </div>
        <button onClick={onSeeAll} className="text-xs text-accentViolet hover:underline font-medium">
          {t.favorites.see_more || 'Ещё'}
        </button>
      </div>

      <div className="space-y-2.5">
        {items.slice(0, 10).map((item) => (
          <ItemCard key={item.id} item={item} onSelect={onSelectItem} onToggleStatus={onToggleStatus} t={t} />
        ))}
      </div>
    </div>
  );
};
