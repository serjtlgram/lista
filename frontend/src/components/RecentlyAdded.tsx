import React from 'react';
import { Item } from '../types';
import { ItemCard } from './ItemCard';
import { PlusCircle, Plus } from 'lucide-react';
import { Translations } from '../services/i18n';

interface RecentlyAddedProps {
  items: Item[];
  onSeeAll: () => void;
  onSelectItem: (item: Item) => void;
  onToggleStatus?: (item: Item, e: React.MouseEvent) => void;
  onUpdateItem?: (id: string, updates: Partial<Item>) => void;
  onAddItemClick?: () => void;
  t: Translations;
}

export const RecentlyAdded: React.FC<RecentlyAddedProps> = ({
  items,
  onSeeAll,
  onSelectItem,
  onToggleStatus,
  onUpdateItem,
  onAddItemClick,
  t,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-200">{t.recently_added.title}</h2>
        {items.length > 0 && (
          <button onClick={onSeeAll} className="text-xs text-accentViolet hover:underline font-medium">
            {t.recently_added.see_all}
          </button>
        )}
      </div>

      {items.length > 0 ? (
        <div className="space-y-2.5">
          {items.slice(0, 5).map((item) => (
            <ItemCard 
              key={item.id} 
              item={item} 
              onSelect={onSelectItem} 
              onToggleStatus={onToggleStatus} 
              onUpdateItem={onUpdateItem}
              t={t} 
            />
          ))}

          {/* Centered plus in circle button below the last card on Home screen */}
          <div className="flex justify-center pt-2">
            <button
              onClick={onAddItemClick}
              className="p-1 rounded-full text-accentViolet hover:text-accentViolet/80 active:scale-[0.97] transition opacity-80 hover:opacity-100"
              title={t.modal.add_item}
            >
              <PlusCircle className="w-6 h-6 stroke-[2]" />
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={onAddItemClick}
          className="glass-card p-6 rounded-2xl text-center space-y-2 cursor-pointer hover:border-accentViolet/50 transition border-dashed"
        >
          <PlusCircle className="w-8 h-8 mx-auto text-accentViolet opacity-80" />
          <p className="text-xs font-semibold text-gray-300">{t.recently_added.empty}</p>
        </div>
      )}
    </div>
  );
};
