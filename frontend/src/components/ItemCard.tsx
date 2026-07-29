import React from 'react';
import { Star, Check, Plus, Minus } from 'lucide-react';
import { Item } from '../types';
import { getItemPoster } from '../services/posters';
import { Translations } from '../services/i18n';

interface ItemCardProps {
  item: Item;
  onSelect: (item: Item) => void;
  onToggleStatus?: (item: Item, e: React.MouseEvent) => void;
  onAdd?: (item: Item, e: React.MouseEvent) => void;
  onRemoveFromList?: (item: Item, e: React.MouseEvent) => void;
  showCheckbox?: boolean;
  t?: Translations;
}

export const ItemCard: React.FC<ItemCardProps> = ({
  item,
  onSelect,
  onToggleStatus,
  onAdd,
  onRemoveFromList,
  t,
}) => {
  const isCompleted = item.status === 'completed' || item.status === 'Просмотрено' || item.status === 'Завершено';
  const isPlanned = item.status === 'planned' || item.status === 'в планах' || item.status === 'у планах' || item.status === 'отложено';

  const posterSrc = getItemPoster(item);

  const formatCategorySingle = (cat: string) => {
    if (!t) {
      switch (cat?.toLowerCase()) {
        case 'movie': case 'movies': case 'фильмы': case 'фильм': return 'Фильм';
        case 'show': case 'shows': case 'series': case 'сериалы': case 'сериал': return 'Сериал';
        case 'book': case 'books': case 'книги': case 'книга': return 'Книга';
        case 'game': case 'games': case 'игры': case 'ігри': case 'игра': case 'гра': return 'Игра';
        default: return cat;
      }
    }
    switch (cat?.toLowerCase()) {
      case 'movie': case 'movies': case 'фильмы': case 'фильм': return t.categories.movie_single;
      case 'show': case 'shows': case 'series': case 'сериалы': case 'сериал': return t.categories.show_single;
      case 'book': case 'books': case 'книги': case 'книга': return t.categories.book_single;
      case 'game': case 'games': case 'игры': case 'ігри': case 'игра': case 'гра': return t.categories.game_single;
      default: return cat;
    }
  };

  const formatSubtitle = () => {
    const parts: string[] = [];

    // 1. Category
    const catLabel = formatCategorySingle(item.category);
    if (catLabel) parts.push(catLabel);

    // 2. Release Year
    if (item.release_year) {
      parts.push(item.release_year);
    }

    // 3. Genre
    if (item.genre) {
      const rawGenre = item.genre.trim();
      const translatedGenre = t ? (t.genres[rawGenre as keyof typeof t.genres] || rawGenre) : rawGenre;
      if (translatedGenre) parts.push(translatedGenre);
    }

    // 3b. Author
    const authorName = item.author;
    if (authorName) {
      parts.push(authorName);
    }

    // 4. Duration & Episode count
    let durStr = '';
    let epStr = '';

    const rawDur = (item.duration || '').trim();
    const epUnit = t ? t.modal.episodes_unit : 'сер.';
    const minUnit = t ? t.details.minutes_short : 'мин';
    const pageUnit = t ? (t.details.pages_unit || 'стр.') : 'стр.';
    const catLc = (item.category || '').toLowerCase().trim();
    const isBook = catLc.includes('book') || catLc.includes('книг');

    if (rawDur.includes('•')) {
      const splitParts = rawDur.split('•');
      const epNum = splitParts[0]?.replace(/\D/g, '') || '';
      const durNum = splitParts[1]?.replace(/\D/g, '') || '';
      if (durNum) durStr = `${durNum} ${isBook ? pageUnit : minUnit}`;
      if (epNum) epStr = `${epNum} ${epUnit}`;
    } else if (rawDur.includes('сер.') || rawDur.includes('ep.')) {
      const epNum = rawDur.replace(/\D/g, '');
      if (epNum) epStr = `${epNum} ${epUnit}`;
    } else if (rawDur) {
      const durNum = rawDur.replace(/\D/g, '');
      if (durNum) durStr = `${durNum} ${isBook ? pageUnit : minUnit}`;
      else durStr = isBook && !rawDur.includes('стр') ? `${rawDur} ${pageUnit}` : rawDur;
    }

    if (item.episodes && item.episodes > 0 && !epStr) {
      epStr = `${item.episodes} ${epUnit}`;
    }

    if (durStr) parts.push(durStr);
    if (epStr) parts.push(epStr);

    return parts.length > 0 ? parts.join(' • ') : catLabel;
  };

  return (
    <div
      onClick={() => onSelect(item)}
      className="glass-card p-2.5 rounded-2xl flex items-center justify-between cursor-pointer active:scale-95 transition card-hover"
    >
      <div className="flex items-center gap-3">
        {/* Square poster image without distortion */}
        <img
          src={posterSrc}
          className="w-12 h-12 aspect-square object-cover object-center rounded-xl bg-cardDark shrink-0"
          alt={item.title}
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            if (!target.dataset.fallback) {
              target.dataset.fallback = 'true';
              target.src = getItemPoster({ id: item.id, title: item.title, poster_url: '' });
            }
          }}
        />
        <div>
          <h3 className="text-sm font-bold text-white line-clamp-1">{item.title}</h3>
          <p className="text-[11px] text-gray-400">
            {formatSubtitle()}
          </p>
          <div className="flex items-center gap-1 mt-1 text-xs font-semibold text-amber-400">
            {!isPlanned ? (
              <>
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
                <span>{item.rating || 10}/10</span>
              </>
            ) : (
              <span className="text-[11px] text-gray-500 font-normal">
                {t ? t.modal.status_planned : 'В планах'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action Button: Either Minus for list items, "+ Add" for catalog items, or status checkmark */}
      {onRemoveFromList ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemoveFromList(item, e);
          }}
          className="w-7 h-7 rounded-full border border-red-500/40 bg-red-500/15 text-red-500 hover:bg-red-500/25 flex items-center justify-center transition shrink-0 active:scale-90 shadow-sm"
          title="Исключить из списка"
        >
          <Minus className="w-4 h-4 stroke-[3]" />
        </button>
      ) : onAdd ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAdd(item, e);
          }}
          className="w-7 h-7 rounded-full bg-accentViolet hover:bg-accentViolet/80 active:scale-95 text-white flex items-center justify-center transition shrink-0 shadow-md shadow-accentViolet/30"
          title="Добавить в свой список"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
        </button>
      ) : (
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
      )}
    </div>
  );
};
