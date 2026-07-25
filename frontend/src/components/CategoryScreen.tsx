import React, { useState } from 'react';
import { ChevronLeft, Search as SearchIcon, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { Item } from '../types';
import { ItemCard } from './ItemCard';

interface CategoryScreenProps {
  title: string;
  items: Item[];
  onBack: () => void;
  onSelectItem: (item: Item) => void;
  onToggleStatus: (item: Item) => void;
}

export const CategoryScreen: React.FC<CategoryScreenProps> = ({
  title,
  items,
  onBack,
  onSelectItem,
  onToggleStatus,
}) => {
  const [activeFilter, setActiveFilter] = useState('Все');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchInput, setShowSearchInput] = useState(false);

  const filters = ['Все', 'Смотрю', 'Просмотрено', 'Отложено'];

  const filteredItems = items.filter((item) => {
    // Filter by status chip
    if (activeFilter === 'Смотрю' && item.status !== 'watching' && item.status !== 'Смотрю') return false;
    if (activeFilter === 'Просмотрено' && item.status !== 'completed' && item.status !== 'Просмотрено') return false;
    if (activeFilter === 'Отложено' && item.status !== 'planned' && item.status !== 'Отложено') return false;

    // Filter by search text
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return item.title.toLowerCase().includes(q) || (item.genre && item.genre.toLowerCase().includes(q));
    }

    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="p-2 text-gray-300 hover:text-white">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-base font-bold">{title}</h1>
        <div className="flex items-center gap-2">
          <SearchIcon
            onClick={() => setShowSearchInput(!showSearchInput)}
            className="w-5 h-5 text-gray-300 cursor-pointer hover:text-white"
          />
          <SlidersHorizontal className="w-5 h-5 text-gray-300 cursor-pointer hover:text-white" />
        </div>
      </div>

      {showSearchInput && (
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск по названию или жанру..."
          className="w-full bg-bgDark border border-cardBorder rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-accentViolet"
        />
      )}

      {/* Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-1">
        {filters.map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
              activeFilter === filter
                ? 'bg-accentViolet text-white'
                : 'bg-cardDark border border-cardBorder text-gray-300 font-medium'
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Subheader count & sort */}
      <div className="flex items-center justify-between text-xs text-gray-400 pt-1">
        <span>{filteredItems.length} элементов</span>
        <button className="flex items-center gap-1 hover:text-white">
          По дате <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Items List */}
      <div className="space-y-2.5">
        {filteredItems.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            onSelect={onSelectItem}
            showCheckbox={true}
            onToggleStatus={() => onToggleStatus(item)}
          />
        ))}

        {filteredItems.length === 0 && (
          <div className="text-center py-10 text-xs text-gray-500">
            Ничего не найдено в этой категории
          </div>
        )}
      </div>
    </div>
  );
};
