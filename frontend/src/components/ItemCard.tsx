import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Star, Check, Plus, Minus, ChevronDown, X, FolderCheck } from 'lucide-react';
import { Item } from '../types';
import { getItemPoster } from '../services/posters';
import { Translations } from '../services/i18n';
import { getLists, saveLists, FAVORITES_ID } from '../services/lists';
import { getFavoriteIds, toggleFavorite } from '../services/favorites';

interface ItemCardProps {
  item: Item;
  onSelect: (item: Item) => void;
  onToggleStatus?: (item: Item, e: React.MouseEvent) => void;
  onAdd?: (item: Item, e: React.MouseEvent) => void;
  onRemoveFromList?: (item: Item, e: React.MouseEvent) => void;
  onUpdateItem?: (id: string, updates: Partial<Item>) => void;
  showCheckbox?: boolean;
  t?: Translations;
}

export const ItemCard: React.FC<ItemCardProps> = ({
  item,
  onSelect,
  onToggleStatus,
  onAdd,
  onRemoveFromList,
  onUpdateItem,
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

  const [listsItemIsIn, setListsItemIsIn] = useState<{id: string, name: string}[]>([]);
  const [isGenreOpen, setIsGenreOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isListsOpen, setIsListsOpen] = useState(false);
  const [tempListIds, setTempListIds] = useState<string[]>([]);
  const [allUserLists, setAllUserLists] = useState<{id: string, name: string, isDefault?: boolean}[]>([]);

  const recalculateLists = () => {
    const favs = getFavoriteIds();
    const allLists = getLists();
    const inLists: {id: string, name: string}[] = [];
    
    if (favs.includes(item.id)) {
      inLists.push({ id: FAVORITES_ID, name: t ? t.lists.favorites : 'Избранное' });
    }
    allLists.forEach(l => {
      if (!l.isDefault && l.itemIds.includes(item.id)) {
        inLists.push({ id: l.id, name: l.name });
      }
    });
    setListsItemIsIn(inLists);
  };

  useEffect(() => {
    recalculateLists();
  }, [item.id, t]);

  const openListsModal = (e: React.MouseEvent) => {
    e.stopPropagation();
    const favs = getFavoriteIds();
    const allLists = getLists();
    setAllUserLists([
      { id: FAVORITES_ID, name: t ? t.lists.favorites : 'Избранное', isDefault: true },
      ...allLists.filter(l => !l.isDefault).map(l => ({ id: l.id, name: l.name }))
    ]);

    const inLists: string[] = [];
    if (favs.includes(item.id)) inLists.push(FAVORITES_ID);
    allLists.forEach(l => {
      if (!l.isDefault && l.itemIds.includes(item.id)) inLists.push(l.id);
    });
    setTempListIds(inLists);
    setIsListsOpen(true);
  };

  const toggleTempList = (id: string) => {
    setTempListIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const saveListsChanges = () => {
    if (tempListIds.includes(FAVORITES_ID)) {
      if (!getFavoriteIds().includes(item.id)) toggleFavorite(item.id);
    } else {
      if (getFavoriteIds().includes(item.id)) toggleFavorite(item.id);
    }

    const allLists = getLists();
    const updatedLists = allLists.map(l => {
      if (l.isDefault) return l;
      const hasItem = l.itemIds.includes(item.id);
      const shouldHave = tempListIds.includes(l.id);
      if (hasItem && !shouldHave) {
        return { ...l, itemIds: l.itemIds.filter(id => id !== item.id) };
      } else if (!hasItem && shouldHave) {
        return { ...l, itemIds: [...l.itemIds, item.id] };
      }
      return l;
    });
    saveLists(updatedLists);
    recalculateLists();
    setIsListsOpen(false);
  };

  const handleUpdateField = async (field: string, value: string) => {
    if (onUpdateItem) {
      onUpdateItem(item.id, { [field]: value });
    }
  };

  const rawGenre = (item.genre || '').trim();
  const translatedGenre = t ? (t.genres[rawGenre as keyof typeof t.genres] || rawGenre) : rawGenre;

  const catLc = (item.category || '').toLowerCase();
  const isMovie = ['movie', 'movies', 'фильмы', 'фильм'].includes(catLc);
  const isShow = ['show', 'shows', 'series', 'сериалы', 'сериал'].includes(catLc);
  const isBook = ['book', 'books', 'книги', 'книга'].includes(catLc);
  const isGame = ['game', 'games', 'игры', 'игра'].includes(catLc);

  const getWatchingLabel = () => {
    if (isBook) return t ? t.modal.status_watching_book : 'Читаю';
    if (isGame) return t ? t.modal.status_watching_game : 'Играю';
    return t ? t.modal.status_watching_movie : 'Смотрю';
  };

  const statuses = [
    { value: 'planned', label: t ? t.modal.status_planned : 'В планах' },
    { value: 'watching', label: getWatchingLabel() },
    { value: 'completed', label: t ? t.modal.status_completed : 'Завершено' },
    { value: 'paused', label: 'Отложено' },
  ];

  const currentStatusObj = statuses.find(s => s.value === item.status) || statuses[0];



  let availableGenres: string[] = [];
  if (t) {
    if (isMovie || isShow) availableGenres = Object.values(t.genres).slice(0, 15);
    else if (isBook) availableGenres = ['Роман', 'Фантастика', 'Детектив', 'Фэнтези', 'Биография', 'Другое'];
    else if (isGame) availableGenres = ['Action', 'RPG', 'Shooter', 'Strategy', 'Puzzle', 'Другое'];
  } else {
    availableGenres = ['Драма', 'Комедия', 'Триллер', 'Фантастика', 'Ужасы', 'Документальный', 'Другое'];
  }

  const triggerHaptic = () => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.impactOccurred('light');
    }
  };

  return (
    <>
      <div
        onClick={() => onSelect(item)}
        className="glass-card p-2.5 rounded-2xl flex flex-col gap-2 cursor-pointer active:scale-95 transition card-hover relative overflow-hidden"
      >
        <div className="flex items-center gap-3 w-full">
          {/* Rectangular poster image */}
          <img
            src={posterSrc}
            className="w-[52px] h-[78px] object-cover object-center rounded-xl bg-cardDark shrink-0"
            alt={item.title}
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              if (!target.dataset.fallback) {
                target.dataset.fallback = 'true';
                target.src = getItemPoster({ id: item.id, title: item.title, poster_url: '' });
              }
            }}
          />
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            {/* Row 1: Title */}
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-bold text-white line-clamp-1 leading-tight">{item.title}</h3>
              {/* Star Rating on top right next to title */}
              {!isPlanned && item.rating > 0 && (
                <div className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-400 shrink-0 bg-amber-400/10 px-1.5 py-0.5 rounded-md">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />
                  <span>{item.rating}</span>
                </div>
              )}
            </div>
            
            {/* Row 2: Subtitle */}
            <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">
              {formatSubtitle()}
            </p>

            {/* Row 3: Lists */}
            {listsItemIsIn.length > 0 && (
              <div className="flex items-center gap-1 mt-1.5 text-[10px] font-medium text-accentViolet flex-wrap">
                <FolderCheck className="w-3 h-3" />
                <span className="truncate">{listsItemIsIn.map(l => l.name).join(', ')}</span>
              </div>
            )}
            
            {/* Row 4: Action Buttons */}
            {!onAdd ? (
              <div className="flex items-center gap-1.5 mt-2 flex-nowrap overflow-x-auto hide-scrollbar pb-1 -mb-1 w-full">
                <button
                  onClick={(e) => { e.stopPropagation(); triggerHaptic(); setIsGenreOpen(true); }}
                  className="px-2 py-1 rounded-lg bg-cardDark border border-cardBorder hover:border-gray-500 text-[10px] font-bold text-gray-300 flex items-center gap-1 transition shrink-0"
                >
                  <span className="truncate max-w-[70px]">{translatedGenre || 'Жанр'}</span>
                  <ChevronDown className="w-3 h-3 text-gray-500 shrink-0" />
                </button>

                <button
                  onClick={(e) => { e.stopPropagation(); triggerHaptic(); setIsStatusOpen(true); }}
                  className="px-2 py-1 rounded-lg bg-cardDark border border-cardBorder hover:border-gray-500 text-[10px] font-bold text-gray-300 flex items-center gap-1 transition shrink-0"
                >
                  <span className="truncate max-w-[80px]">{currentStatusObj.label}</span>
                  <ChevronDown className="w-3 h-3 text-gray-500 shrink-0" />
                </button>

                <button
                  onClick={(e) => { triggerHaptic(); openListsModal(e); }}
                  className="px-2 py-1 rounded-lg bg-cardDark border border-cardBorder hover:border-gray-500 text-[10px] font-bold text-gray-300 flex items-center gap-1 transition shrink-0"
                >
                  <span>Списки</span>
                  <ChevronDown className="w-3 h-3 text-gray-500 shrink-0" />
                </button>
              </div>
            ) : (
              <div className="mt-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerHaptic();
                    onAdd(item, e);
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accentViolet hover:bg-accentViolet/80 text-white text-[10px] font-bold transition shadow-sm w-max"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Добавить</span>
                </button>
              </div>
            )}
          </div>
          
          {/* Action Button: Minus for list items */}
          {onRemoveFromList && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemoveFromList(item, e);
              }}
              className="w-7 h-7 rounded-full border border-red-500/40 bg-red-500/15 text-red-500 hover:bg-red-500/25 flex items-center justify-center transition shrink-0 active:scale-90 shadow-sm ml-1"
              title="Исключить из списка"
            >
              <Minus className="w-4 h-4 stroke-[3]" />
            </button>
          )}
        </div>
      </div>

      {/* Modals via Portal */}
      {isGenreOpen && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in" onClick={() => setIsGenreOpen(false)}>
          <div className="w-full sm:max-w-xs bg-cardDark border-t sm:border border-cardBorder rounded-t-3xl sm:rounded-3xl p-5 space-y-3 animate-slide-up pb-10 sm:pb-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-cardBorder pb-3">
              <h3 className="text-base font-bold text-white">Выберите жанр</h3>
              <button onClick={() => setIsGenreOpen(false)} className="text-gray-400 hover:text-white p-1"><X className="w-5 h-5" /></button>
            </div>
            <div className="max-h-[50vh] overflow-y-auto space-y-1.5 hide-scrollbar">
              {availableGenres.map(g => (
                <button
                  key={g}
                  onClick={() => { triggerHaptic(); handleUpdateField('genre', g); setIsGenreOpen(false); }}
                  className={`w-full text-left p-3 rounded-xl text-sm font-medium transition ${rawGenre === g ? 'bg-accentViolet text-white' : 'text-gray-300 hover:bg-bgDark'}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}

      {isStatusOpen && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in" onClick={() => setIsStatusOpen(false)}>
          <div className="w-full sm:max-w-xs bg-cardDark border-t sm:border border-cardBorder rounded-t-3xl sm:rounded-3xl p-5 space-y-3 animate-slide-up pb-10 sm:pb-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-cardBorder pb-3">
              <h3 className="text-base font-bold text-white">Состояние</h3>
              <button onClick={() => setIsStatusOpen(false)} className="text-gray-400 hover:text-white p-1"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-1.5">
              {statuses.map(s => (
                <button
                  key={s.value}
                  onClick={() => { triggerHaptic(); handleUpdateField('status', s.value); setIsStatusOpen(false); }}
                  className={`w-full text-left p-3 rounded-xl text-sm font-medium transition flex items-center justify-between ${item.status === s.value ? 'bg-accentViolet text-white' : 'text-gray-300 hover:bg-bgDark'}`}
                >
                  <span>{s.label}</span>
                  {item.status === s.value && <Check className="w-4 h-4" />}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}

      {isListsOpen && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in" onClick={() => setIsListsOpen(false)}>
          <div className="w-full sm:max-w-xs bg-cardDark border-t sm:border border-cardBorder rounded-t-3xl sm:rounded-3xl p-5 space-y-4 animate-slide-up pb-8 sm:pb-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-cardBorder pb-3">
              <h3 className="text-base font-bold text-white">Списки</h3>
              <button onClick={() => setIsListsOpen(false)} className="text-gray-400 hover:text-white p-1"><X className="w-5 h-5" /></button>
            </div>
            <div className="max-h-[50vh] overflow-y-auto space-y-2 hide-scrollbar">
              {allUserLists.map(list => {
                const isSelected = tempListIds.includes(list.id);
                return (
                  <div
                    key={list.id}
                    onClick={() => { triggerHaptic(); toggleTempList(list.id); }}
                    className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition select-none ${
                      isSelected ? 'bg-accentViolet/20 border-accentViolet' : 'bg-bgDark border-cardBorder hover:border-gray-600'
                    }`}
                  >
                    <span className="text-sm font-bold text-white">{list.name}</span>
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center transition border ${
                      isSelected ? 'bg-accentViolet border-accentViolet text-white' : 'border-cardBorder bg-bgDark text-transparent'
                    }`}>
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  </div>
                );
              })}
              {allUserLists.length === 0 && (
                <div className="text-center py-4 text-xs text-gray-500">У вас еще нет списков</div>
              )}
            </div>
            <button
              onClick={() => { triggerHaptic(); saveListsChanges(); }}
              className="w-full py-3 rounded-xl bg-accentViolet text-white font-bold text-sm shadow-lg hover:bg-opacity-90 transition mt-2"
            >
              {t ? t.modal.save : 'Сохранить'}
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
