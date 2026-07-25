import React from 'react';
import { Film, Tv, BookOpen, Headphones, Mic, Gamepad2 } from 'lucide-react';

interface CategoryGridProps {
  counts: Record<string, number>;
  onSelectCategory: (category: string) => void;
}

export const CategoryGrid: React.FC<CategoryGridProps> = ({ counts, onSelectCategory }) => {
  const categories = [
    { title: 'Фильмы', key: 'movie', icon: Film, count: (counts['Фильмы'] || 0) + (counts['movie'] || 0), bg: 'bg-accentViolet/15', text: 'text-accentViolet' },
    { title: 'Сериалы', key: 'show', icon: Tv, count: (counts['Сериалы'] || 0) + (counts['show'] || 0), bg: 'bg-accentTeal/15', text: 'text-accentTeal' },
    { title: 'Книги', key: 'book', icon: BookOpen, count: (counts['Книги'] || 0) + (counts['book'] || 0), bg: 'bg-accentAmber/15', text: 'text-accentAmber' },
    { title: 'Аудиокниги', key: 'audiobook', icon: Headphones, count: (counts['Аудиокниги'] || 0) + (counts['audiobook'] || 0), bg: 'bg-accentBlue/15', text: 'text-accentBlue' },
    { title: 'Подкасты', key: 'podcast', icon: Mic, count: (counts['Подкасты'] || 0) + (counts['podcast'] || 0), bg: 'bg-accentPink/15', text: 'text-accentPink' },
    { title: 'Игры', key: 'game', icon: Gamepad2, count: (counts['Игры'] || 0) + (counts['game'] || 0), bg: 'bg-accentGreen/15', text: 'text-accentGreen' },
  ];

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {categories.map((cat) => {
        const IconComponent = cat.icon;
        return (
          <div
            key={cat.title}
            onClick={() => onSelectCategory(cat.title)}
            className="glass-card p-3.5 rounded-2xl flex items-center gap-3 cursor-pointer active:scale-95 transition"
          >
            <div className={`w-10 h-10 rounded-xl ${cat.bg} flex items-center justify-center ${cat.text}`}>
              <IconComponent className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-300">{cat.title}</div>
              <div className="text-base font-bold text-white">{cat.count}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
