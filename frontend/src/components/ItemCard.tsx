import React from 'react';
import { Star, Check } from 'lucide-react';
import { Item } from '../types';
import { getItemPoster } from '../services/posters';
import { Translations } from '../services/i18n';

interface ItemCardProps {
  item: Item;
  onSelect: (item: Item) => void;
  onToggleStatus?: (item: Item, e: React.MouseEvent) => void;
  showCheckbox?: boolean;
  t?: Translations;
}

export const ItemCard: React.FC<ItemCardProps> = ({
  item,
  onSelect,
  onToggleStatus,
  t,
}) => {
  const starsCount = Math.min(5, Math.max(1, Math.round((item.rating || 10) / 2)));
  const isCompleted = item.status === 'completed' || item.status === 'Просмотрено' || item.status === 'Завершено';

  const posterSrc = getItemPoster(item);

  const formatCategorySingle = (cat: string) => {
    if (!t) {
      switch (cat?.toLowerCase()) {
        case 'movie': case 'movies': case 'фильмы': case 'фильм': return 'Фильм';
        case 'show': case 'shows': case 'series': case 'сериалы': case 'сериал': return 'Сериал';
        case 'book': case 'books': case 'книги': case 'книга': return 'Книга';
        case 'audiobook': case 'audiobooks': case 'аудиокниги': case 'аудіокниги': case 'аудиокнига': return 'Аудиокнига';
        case 'podcast': case 'podcasts': case 'подкасты': case 'подкасти': case 'подкаст': return 'Подкаст';
        case 'game': case 'games': case 'игры': case 'ігри': case 'игра': case 'гра': return 'Игра';
        default: return cat;
      }
    }
    switch (cat?.toLowerCase()) {
      case 'movie': case 'movies': case 'фильмы': case 'фильм': return t.categories.movie_single;
      case 'show': case 'shows': case 'series': case 'сериалы': case 'сериал': return t.categories.show_single;
      case 'book': case 'books': case 'книги': case 'книга': return t.categories.book_single;
      case 'audiobook': case 'audiobooks': case 'аудиокниги': case 'аудіокниги': case 'аудиокнига': return t.categories.audiobook_single;
      case 'podcast': case 'podcasts': case 'подкасты': case 'подкасти': case 'подкаст': return t.categories.podcast_single;
      case 'game': case 'games': case 'игры': case 'ігри': case 'игра': case 'гра': return t.categories.game_single;
      default: return cat;
    }
  };

  const formatSubtitle = () => {
    const catLabel = formatCategorySingle(item.category);
    let durStr = '';

    if (item.duration) {
      const raw = item.duration;
      if (raw.includes('•')) {
        const parts = raw.split('•');
        const epNum = parts[0]?.replace(/\D/g, '') || '';
        const durNum = parts[1]?.replace(/\D/g, '') || '';
        const epUnit = t ? t.modal.episodes_unit : 'сер.';
        const minUnit = t ? t.details.minutes_short : 'мин';

        if (epNum && durNum) {
          durStr = `${epNum} ${epUnit} • ${durNum} ${minUnit}`;
        } else if (epNum) {
          durStr = `${epNum} ${epUnit}`;
        } else if (durNum) {
          durStr = `${durNum} ${minUnit}`;
        }
      } else if (raw.includes('сер.') || raw.includes('ep.')) {
        const epNum = raw.replace(/\D/g, '');
        const epUnit = t ? t.modal.episodes_unit : 'сер.';
        durStr = epNum ? `${epNum} ${epUnit}` : raw;
      } else {
        const durNum = raw.replace(/\D/g, '');
        const minUnit = t ? t.details.minutes_short : 'мин';
        durStr = durNum ? `${durNum} ${minUnit}` : raw;
      }
    }

    const yearOrDur = durStr || item.release_year || '2024';
    return `${catLabel} • ${yearOrDur}`;
  };

  return (
    <div
      onClick={() => onSelect(item)}
      className="glass-card p-2.5 rounded-2xl flex items-center justify-between cursor-pointer active:scale-98 transition"
    >
      <div className="flex items-center gap-3">
        {/* Square poster image without distortion */}
        <img
          src={posterSrc}
          className="w-12 h-12 aspect-square object-cover object-center rounded-xl bg-cardDark shrink-0"
          alt={item.title}
          onError={(e) => {
            (e.target as HTMLImageElement).src = getItemPoster(item);
          }}
        />
        <div>
          <h3 className="text-sm font-bold text-white line-clamp-1">{item.title}</h3>
          <p className="text-[11px] text-gray-400">
            {formatSubtitle()}
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
        title={isCompleted ? (t ? t.modal.status_completed : 'Завершено') : (t ? t.modal.status_watching : 'Отметить просмотренным')}
      >
        <Check className={`w-4 h-4 stroke-[2.5] ${isCompleted ? 'opacity-100' : 'opacity-0'}`} />
      </button>
    </div>
  );
};
