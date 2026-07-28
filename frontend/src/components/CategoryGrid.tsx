import React from 'react';
import { Film, Tv, BookOpen, Headphones, Mic, Gamepad2, PlusCircle } from 'lucide-react';
import { Translations } from '../services/i18n';

interface CategoryGridProps {
  counts: Record<string, number>;
  activeCategories: string[];
  onSelectCategory: (category: string) => void;
  onOpenCategoryConfig: () => void;
  t: Translations;
}

const ALL_CATEGORY_CONFIGS = [
  { key: 'Фильмы', icon: Film, bg: 'bg-accentViolet/15', text: 'text-accentViolet' },
  { key: 'Сериалы', icon: Tv, bg: 'bg-accentTeal/15', text: 'text-accentTeal' },
  { key: 'Книги', icon: BookOpen, bg: 'bg-accentAmber/15', text: 'text-accentAmber' },
  { key: 'Аудиокниги', icon: Headphones, bg: 'bg-accentBlue/15', text: 'text-accentBlue' },
  { key: 'Подкасты', icon: Mic, bg: 'bg-accentPink/15', text: 'text-accentPink' },
  { key: 'Игры', icon: Gamepad2, bg: 'bg-accentGreen/15', text: 'text-accentGreen' },
];

export const CategoryGrid: React.FC<CategoryGridProps> = ({
  counts,
  activeCategories,
  onSelectCategory,
  onOpenCategoryConfig,
  t,
}) => {
  const visibleCategories = ALL_CATEGORY_CONFIGS.filter((cat) => activeCategories.includes(cat.key));

  const getTranslatedTitle = (catKey: string): string => {
    switch (catKey) {
      case 'Фильмы':
        return t.categories.movies;
      case 'Сериалы':
        return t.categories.shows;
      case 'Книги':
        return t.categories.books;
      case 'Аудиокниги':
        return t.categories.audiobooks;
      case 'Подкасты':
        return t.categories.podcasts;
      case 'Игры':
        return t.categories.games;
      default:
        return catKey;
    }
  };

  const getCount = (catKey: string): number => {
    if (catKey === 'Фильмы') return (counts['Фильмы'] || 0) + (counts['movie'] || 0);
    if (catKey === 'Сериалы') return (counts['Сериалы'] || 0) + (counts['show'] || 0);
    if (catKey === 'Книги') return (counts['Книги'] || 0) + (counts['book'] || 0);
    if (catKey === 'Аудиокниги') return (counts['Аудиокниги'] || 0) + (counts['audiobook'] || 0);
    if (catKey === 'Подкасты') return (counts['Подкасты'] || 0) + (counts['podcast'] || 0);
    if (catKey === 'Игры') return (counts['Игры'] || 0) + (counts['game'] || 0);
    return counts[catKey] || 0;
  };

  const total = visibleCategories.length;
  let rowGroups: { items: typeof visibleCategories; cols: number }[] = [];

  if (total % 2 === 0) {
    // Even number of categories: 2 per row
    rowGroups = [{ items: visibleCategories, cols: 2 }];
  } else if (total === 1) {
    rowGroups = [{ items: visibleCategories, cols: 1 }];
  } else if (total === 3) {
    rowGroups = [{ items: visibleCategories, cols: 3 }];
  } else if (total === 5) {
    // Row 1: top 3 categories (cols = 3)
    // Row 2: remaining 2 categories (cols = 2)
    rowGroups = [
      { items: visibleCategories.slice(0, 3), cols: 3 },
      { items: visibleCategories.slice(3), cols: 2 },
    ];
  } else {
    // Fallback for larger odd numbers
    rowGroups = [
      { items: visibleCategories.slice(0, 3), cols: 3 },
      { items: visibleCategories.slice(3), cols: 2 },
    ];
  }

  const renderCard = (cat: (typeof ALL_CATEGORY_CONFIGS)[0], cols: number) => {
    const IconComponent = cat.icon;
    const count = getCount(cat.key);
    const title = getTranslatedTitle(cat.key);
    const isThreeCols = cols === 3;

    return (
      <div
        key={cat.key}
        onClick={() => onSelectCategory(cat.key)}
        className={`glass-card ${
          isThreeCols ? 'p-2.5 sm:p-3 gap-2' : 'p-3.5 gap-3'
        } rounded-2xl flex items-center cursor-pointer active:scale-95 transition card-hover min-w-0`}
      >
        <div
          className={`${
            isThreeCols ? 'w-8 h-8 sm:w-9 sm:h-9' : 'w-10 h-10'
          } rounded-xl ${cat.bg} flex items-center justify-center ${cat.text} shrink-0`}
        >
          <IconComponent className={isThreeCols ? 'w-4 h-4' : 'w-5 h-5'} />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className={`${
              isThreeCols ? 'text-[11px] sm:text-xs' : 'text-xs'
            } font-semibold text-gray-300 truncate`}
          >
            {title}
          </div>
          <div className={`${isThreeCols ? 'text-sm sm:text-base' : 'text-base'} font-bold text-white`}>
            {count}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2.5 -mb-3">
      {rowGroups.map((group, groupIdx) => (
        <div
          key={groupIdx}
          className={`grid gap-2.5 ${
            group.cols === 1
              ? 'grid-cols-1'
              : group.cols === 3
              ? 'grid-cols-3'
              : 'grid-cols-2'
          }`}
        >
          {group.items.map((cat) => renderCard(cat, group.cols))}
        </div>
      ))}

      {/* Discrete Plus Circle Button under the grid */}
      <div className="flex justify-center pt-0.5">
        <button
          onClick={onOpenCategoryConfig}
          className="p-1 rounded-full text-accentViolet hover:text-accentViolet/80 active:scale-90 transition opacity-80 hover:opacity-100"
          title={t.profile.categories_manage}
        >
          <PlusCircle className="w-6 h-6 stroke-[2]" />
        </button>
      </div>
    </div>
  );
};
