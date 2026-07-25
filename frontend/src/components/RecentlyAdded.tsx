import React from 'react';
import { Item } from '../types';
import { ItemCard } from './ItemCard';
import { PlusCircle } from 'lucide-react';

interface RecentlyAddedProps {
  items: Item[];
  onSeeAll: () => void;
  onSelectItem: (item: Item) => void;
  onAddItemClick?: () => void;
}

export const RecentlyAdded: React.FC<RecentlyAddedProps> = ({
  items,
  onSeeAll,
  onSelectItem,
  onAddItemClick,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-200">Недавно добавленные</h2>
        {items.length > 0 && (
          <button onClick={onSeeAll} className="text-xs text-accentViolet hover:underline font-medium">
            Смотреть все
          </button>
        )}
      </div>

      {items.length > 0 ? (
        <div className="space-y-2.5">
          {items.slice(0, 5).map((item) => (
            <ItemCard key={item.id} item={item} onSelect={onSelectItem} />
          ))}
        </div>
      ) : (
        <div
          onClick={onAddItemClick}
          className="glass-card p-6 rounded-2xl text-center space-y-2 cursor-pointer hover:border-accentViolet/50 transition border-dashed"
        >
          <PlusCircle className="w-8 h-8 mx-auto text-accentViolet opacity-80" />
          <p className="text-xs font-semibold text-gray-300">Пока нет записей</p>
          <p className="text-[11px] text-gray-400">Нажмите сюда или на +, чтобы добавить первое впечатление</p>
        </div>
      )}
    </div>
  );
};
