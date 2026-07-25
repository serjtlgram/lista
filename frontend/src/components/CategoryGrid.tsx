import React from 'react';
import { Film, Tv, BookOpen, Headphones, Mic, Gamepad2, Plus } from 'lucide-react';
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

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {t.profile.categories_config}
        </span>
        <button
          onClick={onOpenCategoryConfig}
          className="flex items-center gap-1 text-xs text-accentViolet hover:text-accentViolet/80 font-medium py-0.5 px-2 rounded-lg bg-accentViolet/10 border border-accentViolet/20 transition active:scale-95"
          title={t.profile.categories_manage}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{t.profile.categories_manage}</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {visibleCategories.map((cat) => {
          const IconComponent = cat.icon;
          const count = getCount(cat.key);
          const title = getTranslatedTitle(cat.key);

          return (
            <div
              key={cat.key}
              onClick={() => onSelectCategory(cat.key)}
              className="glass-card p-3.5 rounded-2xl flex items-center gap-3 cursor-pointer active:scale-95 transition"
            >
              <div className={`w-10 h-10 rounded-xl ${cat.bg} flex items-center justify-center ${cat.text}`}>
                <IconComponent className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-300">{title}</div>
                <div className="text-base font-bold text-white">{count}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
