import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Star, Check, Plus, Minus, ChevronDown, X, FolderCheck, Popcorn, Share2 } from 'lucide-react';
import { Item } from '../types';
import { getItemPoster } from '../services/posters';
import { Translations } from '../services/i18n';
import { getLists, saveLists, FAVORITES_ID } from '../services/lists';
import { getTranslatedGenreShort, getTranslatedGenreFull, getAvailableGenres } from '../services/genres';
import { getFavoriteIds, toggleFavorite } from '../services/favorites';
import { ListSelectionModal } from './ListSelectionModal';
import { shareItem } from '../services/share';

interface ItemCardProps {
  item: Item;
  onSelect: (item: Item) => void;
  onToggleStatus?: (item: Item, e: React.MouseEvent) => void;
  onAdd?: (item: Item, e: React.MouseEvent) => void;
  onRemoveFromList?: (item: Item, e: React.MouseEvent) => void;
  onUpdateItem?: (id: string, updates: Partial<Item>) => void;
  showCheckbox?: boolean;
  t?: Translations;
  searchMode?: string;
  searchQuery?: string;
}

export const ItemCard: React.FC<ItemCardProps> = ({
  item,
  onSelect,
  onToggleStatus,
  onAdd,
  onRemoveFromList,
  onUpdateItem,
  t,
  searchMode,
  searchQuery,
}) => {
  const isCompleted = item.status === 'completed' || item.status === 'Просмотрено' || item.status === 'Завершено';
  const isPlanned = item.status === 'planned' || item.status === 'в планах' || item.status === 'у планах' || item.status === 'отложено';
  const hasStar = !isPlanned && item.rating > 0;
  const hasMinus = !!onRemoveFromList;

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

  const formatSubtitle = (): { line1: string, line2?: string } => {
    const partsLine1: string[] = [];
    const partsLine2: string[] = [];

    const catLc = (item.category || '').toLowerCase().trim();
    const isBook = ['book', 'books', 'книги', 'книга'].includes(catLc);
    const isSeries = ['show', 'shows', 'series', 'сериалы', 'сериал'].includes(catLc);
    const isMovie = ['movie', 'movies', 'фильмы', 'фильм'].includes(catLc);

    // 1. Category
    const catLabel = formatCategorySingle(item.category);
    if (catLabel) partsLine1.push(catLabel);

    // 2. Release Year
    if (item.release_year) {
      partsLine1.push(item.release_year);
    }

    // 3. Director / Author / Matched Actor
    let displayedAuthor = '';
    const rawAuthorOrDirector = item.director || item.author || '';

    if (searchMode === 'actor' && item.cast) {
      const actors = item.cast.split(/[,;\/\n]+/).map(s => s.trim()).filter(Boolean);
      let matchedActor = '';
      if (searchQuery) {
        const words = searchQuery.toLowerCase().trim().split(/\s+/).filter(w => w.length >= 2);
        matchedActor = actors.find(a => words.every(w => a.toLowerCase().includes(w))) || '';
      }
      const targetActor = matchedActor || actors[0] || '';
      if (targetActor) {
        displayedAuthor = targetActor.replace(/^(?:в\s+ролях|режисс[её]р|реж\.?|акт[её]р(?:иса)?|actor|actress|cast)\s*:\s*/i, '').trim();
      }
    } else if ((isSeries || isMovie) && rawAuthorOrDirector) {
      const directors = rawAuthorOrDirector.split(',').map(s => s.trim()).filter(Boolean);
      if (directors[0]) {
        displayedAuthor = directors[0].replace(/^(?:режисс[её]р|реж\.?|director|автор|author)\s*:\s*/i, '').trim();
      }
    } else if (item.author) {
      displayedAuthor = item.author.replace(/^(?:автор|author)\s*:\s*/i, '').trim();
    }
    if (displayedAuthor) partsLine1.push(displayedAuthor);

    // 4. Duration, Episodes, Seasons
    let durStr = '';
    let epStr = '';
    let szStr = '';

    const rawDur = (item.duration || '').trim();
    const epUnit = t ? t.modal.episodes_unit : 'сер.';
    const szUnit = t ? t.modal.seasons_unit : 'сез.';
    const minUnit = t ? t.details.minutes_short : 'мин';
    const pageUnit = t ? (t.details.pages_unit || 'стр.') : 'стр.';

    if (rawDur) {
      if (rawDur.includes('•') || rawDur.includes('сер.') || rawDur.includes('сез.') || rawDur.includes('ep.') || rawDur.includes('s.') || rawDur.includes('t.')) {
        const splitParts = rawDur.split('•').map(p => p.trim());
        let s = '', e = '', m = '';
        splitParts.forEach(p => {
          if (p.includes('сез') || p.includes('s.') || p.includes('t.')) s = p.replace(/\D/g, '');
          else if (p.includes('сер') || p.includes('ep')) e = p.replace(/\D/g, '');
          else if (p.includes('мин') || p.includes('min')) m = p.replace(/\D/g, '');
          else {
            if (!e && !s) e = p.replace(/\D/g, '');
            else if (!m) m = p.replace(/\D/g, '');
          }
        });
        if (s) szStr = `${s} ${szUnit}`;
        if (e) epStr = `${e} ${epUnit}`;
        if (m) durStr = `${m} ${isBook ? pageUnit : minUnit}`;
      } else {
        const durNum = rawDur.replace(/\D/g, '');
        if (durNum) durStr = `${durNum} ${isBook ? pageUnit : minUnit}`;
        else durStr = isBook && !rawDur.includes('стр') ? `${rawDur} ${pageUnit}` : rawDur;
      }
    }

    if (item.episodes && item.episodes > 0 && !epStr) {
      epStr = `${item.episodes} ${epUnit}`;
    }

    if (isSeries) {
       if (durStr) partsLine2.push(durStr);
       if (epStr) partsLine2.push(epStr);
       if (szStr) partsLine2.push(szStr);
    } else {
       if (durStr) partsLine1.push(durStr);
       if (epStr) partsLine1.push(epStr);
       if (szStr) partsLine1.push(szStr);
    }

    return {
      line1: partsLine1.length > 0 ? partsLine1.join(' • ') : catLabel || '',
      line2: partsLine2.length > 0 ? partsLine2.join(' • ') : undefined
    };
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
    const handleListsUpdate = () => recalculateLists();
    window.addEventListener('lista_lists_updated', handleListsUpdate);
    window.addEventListener('lista_favorites_updated', handleListsUpdate);
    return () => {
      window.removeEventListener('lista_lists_updated', handleListsUpdate);
      window.removeEventListener('lista_favorites_updated', handleListsUpdate);
    };
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
  const translatedGenre = t ? getTranslatedGenreFull(rawGenre, t) : rawGenre;

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
  ];

  const currentStatusObj = statuses.find(s => s.value === item.status) || statuses[0];



  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const longPressTimerRef = useRef<any>(null);
  const isLongPressRef = useRef<boolean>(false);
  const touchStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const startLongPress = (clientX: number, clientY: number) => {
    isLongPressRef.current = false;
    touchStartPosRef.current = { x: clientX, y: clientY };
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      shareItem(item, t, showToast);
    }, 500);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const checkMoveCancel = (clientX: number, clientY: number) => {
    const dx = Math.abs(clientX - touchStartPosRef.current.x);
    const dy = Math.abs(clientY - touchStartPosRef.current.y);
    if (dx > 10 || dy > 10) {
      cancelLongPress();
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (e.touches.length === 1) {
      startLongPress(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      checkMoveCancel(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchEnd = () => {
    cancelLongPress();
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (e.button === 0) {
      startLongPress(e.clientX, e.clientY);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    checkMoveCancel(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    cancelLongPress();
  };

  const handleMouseLeave = () => {
    cancelLongPress();
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isLongPressRef.current) {
      e.preventDefault();
      e.stopPropagation();
      isLongPressRef.current = false;
      return;
    }
    onSelect(item);
  };

  const availableGenres = getAvailableGenres(item.category, t);

  const triggerHaptic = () => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.impactOccurred('light');
    }
  };

  const subtitleObj = formatSubtitle();

  return (
    <>
      <div
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onContextMenu={(e) => {
          if (isLongPressRef.current) {
            e.preventDefault();
          }
        }}
        className="glass-card p-2.5 rounded-2xl flex flex-col gap-2 cursor-pointer transition-colors hover:border-accentViolet/50 relative overflow-hidden select-none"
      >
        <div className="flex items-stretch gap-3 w-full">
          {/* Rectangular poster image */}
          <img
            src={posterSrc}
            referrerPolicy="no-referrer"
            className="w-[60px] h-[90px] object-cover object-center rounded-xl bg-gray-200 dark:bg-cardDark shrink-0 self-center"
            alt={item.title}
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              if (!target.dataset.fallback) {
                target.dataset.fallback = 'true';
                target.src = getItemPoster({ id: item.id, title: item.title, poster_url: '' });
              }
            }}
          />
          <div className="flex-1 min-w-0 flex flex-col justify-center py-1">
            {/* Row 1: Title */}
            <div className={`flex items-start justify-between gap-2 ${(hasStar || hasMinus) ? 'pr-[38px]' : ''}`}>
              <h3 className="text-sm font-bold text-white line-clamp-1 leading-tight">{item.title}</h3>
            </div>
            
            {/* Row 2: Subtitle */}
            <div className={`text-[11px] text-gray-400 mt-0.5 ${hasMinus ? 'pr-[38px]' : ''}`}>
              <p className={(hasStar || hasMinus) ? 'line-clamp-1' : ''}>{subtitleObj.line1}</p>
              {subtitleObj.line2 && <p className={(hasStar || hasMinus) ? 'line-clamp-1 mt-0.5' : 'mt-0.5'}>{subtitleObj.line2}</p>}
            </div>

            {/* Row 3: Lists */}
            {listsItemIsIn.length > 0 && (
              <div className={`flex items-center gap-1 mt-1.5 text-[10px] font-medium text-accentViolet flex-wrap ${hasMinus ? 'pr-[38px]' : ''}`}>
                <FolderCheck className="w-3 h-3" />
                <span className="truncate">{listsItemIsIn.map(l => l.name).join(', ')}</span>
              </div>
            )}
            
            {/* Row 4: Action Buttons */}
            {!onAdd ? (
              <div className="flex items-center gap-1.5 mt-2 flex-nowrap overflow-x-auto hide-scrollbar pb-1 -mb-1 w-full pr-10">
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
                  <span>{t?.lists.title}</span>
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
                  <span>{t?.lists.add_items}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Absolute Star Rating / Public Rating (Top Right) */}
        {((!isPlanned && item.rating > 0) || (item.public_rating && item.public_rating.trim() !== '')) && (
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10">
            {item.public_rating && item.public_rating.trim() !== '' && (
              <div className="flex items-center gap-0.5 text-[10px] font-semibold text-orange-400 bg-orange-400/10 px-1.5 py-0.5 rounded-md shadow-sm">
                {isBook ? <Star className="w-3 h-3 text-orange-400 fill-orange-400/20 shrink-0" /> : <Popcorn className="w-3 h-3 text-orange-400 shrink-0" />}
                <span>{item.public_rating}</span>
              </div>
            )}
            {!isPlanned && item.rating > 0 && (
              <div className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-md shadow-sm">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />
                <span>{item.rating}</span>
              </div>
            )}
          </div>
        )}

        {/* Absolute Minus Button (Centered vertically) */}
        {onRemoveFromList && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemoveFromList(item, e);
            }}
            className="absolute top-[calc(50%-7px)] right-2.5 -translate-y-1/2 w-[26px] h-[26px] rounded-full border border-red-500/40 bg-red-500/15 text-red-500 hover:bg-red-500/25 flex items-center justify-center transition active:scale-[0.97] shadow-sm z-10 backdrop-blur-md"
            title={t?.details.remove_from_list}
          >
            <Minus className="w-3.5 h-3.5 stroke-[3]" />
          </button>
        )}
      </div>

      {/* Modals via Portal */}
      {isGenreOpen && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in" onClick={() => setIsGenreOpen(false)}>
          <div className="w-full sm:max-w-xs bg-cardDark border-t sm:border border-cardBorder rounded-t-3xl sm:rounded-3xl p-5 space-y-3 animate-slide-up pb-10 sm:pb-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-cardBorder pb-3">
              <h3 className="text-base font-bold text-white">{t?.modal.select_genre}</h3>
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
              <h3 className="text-base font-bold text-white">{t?.modal.status_label}</h3>
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

      <ListSelectionModal
        isOpen={isListsOpen}
        onClose={() => setIsListsOpen(false)}
        item={item}
        t={t}
        onSave={() => recalculateLists()}
      />

      {toastMessage && createPortal(
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[10000] bg-cardDark border border-cardBorder text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-2xl backdrop-blur-md animate-fade-in flex items-center gap-2 pointer-events-none">
          <Share2 className="w-4 h-4 text-accentTeal" />
          <span>{toastMessage}</span>
        </div>,
        document.body
      )}
    </>
  );
};
