import React from 'react';
import { Item } from '../types';
import { ItemCard } from './ItemCard';

interface RecentlyAddedProps {
  items: Item[];
  onSeeAll: () => void;
  onSelectItem: (item: Item) => void;
}

export const RecentlyAdded: React.FC<RecentlyAddedProps> = ({ items, onSeeAll, onSelectItem }) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-200">Недавно добавленные</h2>
        <button onClick={onSeeAll} className="text-xs text-accentViolet hover:underline font-medium">
          Смотреть все
        </button>
      </div>

      <div className="space-y-2.5">
        {items.slice(0, 3).map((item) => (
          <ItemCard key={item.id} item={item} onSelect={onSelectItem} />
        ))}
      </div>
    </div>
  );
};
