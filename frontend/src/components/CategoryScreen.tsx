import React, { useState } from 'react';
import { ChevronLeft, Search as SearchIcon, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { Item } from '../types';
import { ItemCard } from './ItemCard';
import { Translations } from '../services/i18n';

interface CategoryScreenProps {
  title: string;
  items: Item[];
  onBack: () => void;
  onSelectItem: (item: Item) => void;
  onToggleStatus: (item: Item) => void;
  t: Translations;
}

export const CategoryScreen: React.FC<CategoryScreenProps> = ({
  title,
  items,
  onBack,
  onSelectItem,
  onToggleStatus,
  t,
}) => {
  const [activeFilterKey, setActiveFilterKey] = useState<'all' | 'watching' | 'completed' | 'planned'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchInput, setShowSearchInput] = useState(false);

  const filters = [
    { key: 'all', label: t.recently_added.see_all },
    { key: 'watching', label: t.modal.status_watching },
    { key: 'completed', label: t.modal.status_completed },
    { key: 'planned', label: t.modal.status_planned },
  ];

  const getTranslatedCategoryTitle = (catTitle: string): string => {
    switch (catTitle) {
      case 'Фильмы': return t.categories.movies;
      case 'Сериалы': return t.categories.shows;
      case 'Книги': return t.categories.books;
      case 'Аудиокниги': return t.categories.audiobooks;
      case 'Подкасты': return t.categories.podcasts;
      case 'Игры': return t.categories.games;
      default: return catTitle;
    }
  };

  const filteredItems = items.filter((item) => {
    if (activeFilterKey === 'watching' && item.status !== 'watching' && item.status !== 'Смотрю') return false;
    if (activeFilterKey === 'completed' && item.status !== 'completed' && item.status !== 'Просмотрено') return false;
    if (activeFilterKey === 'planned' && item.status !== 'planned' && item.status !== 'Отложено') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return item.title.toLowerCase().includes(q) || (item.genre && item.genre.toLowerCase().includes(q));
    }

    return true;
  });

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="p-2 text-gray-300 hover:text-white">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-base font-bold text-white">{getTranslatedCategoryTitle(title)}</h1>
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
          placeholder={t.details.search_placeholder}
          className="w-full bg-bgDark border border-cardBorder rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-accentViolet"
        />
      )}

      {/* Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-1">
        {filters.map((filter) => (
          <button
            key={filter.key}
            onClick={() => setActiveFilterKey(filter.key as any)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
              activeFilterKey === filter.key
                ? 'bg-accentViolet text-white shadow-md shadow-accentViolet/30'
                : 'bg-cardDark border border-cardBorder text-gray-300 font-medium hover:border-gray-600'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Subheader count & sort */}
      <div className="flex items-center justify-between text-xs text-gray-400 pt-1">
        <span>{filteredItems.length} {t.details.elements_count}</span>
        <button className="flex items-center gap-1 hover:text-white">
          {t.details.by_date} <ChevronDown className="w-3.5 h-3.5" />
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
            {t.details.no_items_found}
          </div>
        )}
      </div>
    </div>
  );
};
