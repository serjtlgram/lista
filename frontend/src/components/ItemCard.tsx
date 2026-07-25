import React from 'react';
import { Star, Check } from 'lucide-react';
import { Item } from '../types';

interface ItemCardProps {
  item: Item;
  onSelect: (item: Item) => void;
  onToggleStatus?: (item: Item, e: React.MouseEvent) => void;
  showCheckbox?: boolean;
}

export const ItemCard: React.FC<ItemCardProps> = ({
  item,
  onSelect,
  onToggleStatus,
}) => {
  const starsCount = Math.min(5, Math.max(1, Math.round((item.rating || 10) / 2)));
  const isCompleted = item.status === 'completed' || item.status === 'Просмотрено';

  const formatCategory = (cat: string) => {
    switch (cat?.toLowerCase()) {
      case 'movie': case 'фильмы': return 'Фильм';
      case 'show': case 'shows': case 'series': case 'сериалы': return 'Сериал';
      case 'book': case 'книги': return 'Книга';
      case 'audiobook': case 'аудиокниги': return 'Аудиокнига';
      case 'podcast': case 'подкасты': return 'Подкаст';
      case 'game': case 'игры': return 'Игра';
      default: return cat;
    }
  };

  return (
    <div
      onClick={() => onSelect(item)}
      className="glass-card p-2.5 rounded-2xl flex items-center justify-between cursor-pointer active:scale-98 transition"
    >
      <div className="flex items-center gap-3">
        {/* Square poster image without distortion */}
        <img
          src={item.poster_url || 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=300&auto=format&fit=crop&q=80'}
          className="w-12 h-12 aspect-square object-cover object-center rounded-xl bg-cardDark shrink-0"
          alt={item.title}
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=300&auto=format&fit=crop&q=80';
          }}
        />
        <div>
          <h3 className="text-sm font-bold text-white line-clamp-1">{item.title}</h3>
          <p className="text-[11px] text-gray-400">
            {formatCategory(item.category)} • {item.duration || item.release_year || '2024'}
          </p>
          <div className="flex items-center gap-0.5 mt-1 text-amber-400">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star
                key={s}
                className={`w-3 h-3 ${s <= starsCount ? 'fill-amber-400 text-amber-400' : 'text-gray-600'}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Completion Circle Button replacing simple + */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (onToggleStatus) onToggleStatus(item, e);
        }}
        className={`w-7 h-7 rounded-full border flex items-center justify-center transition shrink-0 ${
          isCompleted
            ? 'border-accentTeal bg-accentTeal/15 text-accentTeal'
            : 'border-gray-500 hover:border-accentViolet text-transparent hover:text-gray-400'
        }`}
        title={isCompleted ? 'Завершено' : 'Отметить просмотренным'}
      >
        <Check className={`w-4 h-4 stroke-[2.5] ${isCompleted ? 'opacity-100' : 'opacity-0'}`} />
      </button>
    </div>
  );
};
