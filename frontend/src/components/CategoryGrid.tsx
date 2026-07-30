import React from 'react';
import { Film, Tv, BookOpen, Gamepad2, PlusCircle } from 'lucide-react';
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
    if (catKey === 'Игры') return (counts['Игры'] || 0) + (counts['game'] || 0);
    return counts[catKey] || 0;
  };

  const total = visibleCategories.length;
  const isOdd = total % 2 !== 0;

  return (
    <div className="space-y-1.5 -mb-3">
      {/* Categories Grid - always 2 columns, odd last item spans full row */}
      <div className="grid grid-cols-2 gap-2.5">
        {visibleCategories.map((cat, index) => {
          const IconComponent = cat.icon;
          const count = getCount(cat.key);
          const title = getTranslatedTitle(cat.key);
          const isLastOdd = isOdd && index === total - 1;

          return (
            <div
              key={cat.key}
              onClick={() => onSelectCategory(cat.key)}
              className={`glass-card p-3.5 rounded-2xl flex items-center gap-3 cursor-pointer active:scale-[0.97] transition card-hover min-w-0 ${
                isLastOdd ? 'col-span-2' : ''
              }`}
            >
              <div className={`w-10 h-10 rounded-xl ${cat.bg} flex items-center justify-center ${cat.text} shrink-0`}>
                <IconComponent className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-gray-300 truncate">{title}</div>
                <div className="text-base font-bold text-white">{count}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Discrete Plus Circle Button under the grid */}
      <div className="flex justify-center pt-0.5">
        <button
          onClick={onOpenCategoryConfig}
          className="p-1 rounded-full text-accentViolet hover:text-accentViolet/80 active:scale-[0.97] transition opacity-80 hover:opacity-100"
          title={t.profile.categories_manage}
        >
          <PlusCircle className="w-6 h-6 stroke-[2]" />
        </button>
      </div>
    </div>
  );
};
