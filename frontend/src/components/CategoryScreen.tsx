import React, { useState, useEffect } from 'react';
import { ChevronLeft, Search as SearchIcon, ChevronDown, Globe, FolderCheck, Loader2 } from 'lucide-react';
import { Item, CatalogItem } from '../types';
import { ItemCard } from './ItemCard';
import { Translations } from '../services/i18n';
import { api } from '../services/api';

interface CategoryScreenProps {
  title: string;
  items: Item[];
  activeCategories?: string[];
  searchQuery?: string;
  onSearchQueryChange?: (q: string) => void;
  onSelectCategory?: (category: string) => void;
  onBack: () => void;
  onSelectItem: (item: Item) => void;
  onToggleStatus: (item: Item) => void;
  onAddCatalogItem?: (catalogItem: CatalogItem) => void;
  t: Translations;
}

export const CategoryScreen: React.FC<CategoryScreenProps> = ({
  title,
  items,
  activeCategories = [],
  searchQuery: searchQueryProp = '',
  onSearchQueryChange,
  onSelectCategory,
  onBack,
  onSelectItem,
  onToggleStatus,
  onAddCatalogItem,
  t,
}) => {
  const [activeFilterKey, setActiveFilterKey] = useState<'all' | 'watching' | 'completed' | 'planned'>('all');
  const [internalQuery, setInternalQuery] = useState(searchQueryProp);
  const searchQuery = onSearchQueryChange ? searchQueryProp : internalQuery;
  const setSearchQuery = (q: string) => {
    setInternalQuery(q);
    if (onSearchQueryChange) onSearchQueryChange(q);
  };
  const [showSearchInput, setShowSearchInput] = useState(true);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  const [catalogResults, setCatalogResults] = useState<CatalogItem[]>([]);
  const [isSearchingCatalog, setIsSearchingCatalog] = useState(false);

  const filters = [
    { key: 'all', label: t.recently_added.see_all },
    { key: 'watching', label: t.modal.status_watching },
    { key: 'completed', label: t.modal.status_completed },
    { key: 'planned', label: t.modal.status_planned },
  ];

  const getTranslatedCategoryTitle = (catTitle: string): string => {
    const lc = (catTitle || '').toLowerCase().trim();
    if (['movie', 'movies', 'фильмы', 'фильм'].includes(lc)) return t.categories.movies;
    if (['show', 'shows', 'series', 'сериалы', 'сериал'].includes(lc)) return t.categories.shows;
    if (['book', 'books', 'книги', 'книга'].includes(lc)) return t.categories.books;
    if (['audiobook', 'audiobooks', 'аудиокниги', 'аудиокнига'].includes(lc)) return t.categories.audiobooks;
    if (['podcast', 'podcasts', 'подкасты', 'подкаст'].includes(lc)) return t.categories.podcasts;
    if (['game', 'games', 'игры', 'игра'].includes(lc)) return t.categories.games;
    return catTitle;
  };

  // Map activeCategories strictly to canonical known categories only
  const canonicalCategories = ['Фильмы', 'Сериалы', 'Книги', 'Аудиокниги', 'Подкасты', 'Игры'];

  const mappedCategories: string[] = [];
  activeCategories.forEach((c) => {
    const lc = (c || '').toLowerCase().trim();
    if (['movie', 'movies', 'фильмы', 'фильм'].includes(lc)) mappedCategories.push('Фильмы');
    else if (['show', 'shows', 'series', 'сериалы', 'сериал'].includes(lc)) mappedCategories.push('Сериалы');
    else if (['book', 'books', 'книги', 'книга'].includes(lc)) mappedCategories.push('Книги');
    else if (['audiobook', 'audiobooks', 'аудиокниги', 'аудиокнига'].includes(lc)) mappedCategories.push('Аудиокниги');
    else if (['podcast', 'podcasts', 'подкасты', 'подкаст'].includes(lc)) mappedCategories.push('Подкасты');
    else if (['game', 'games', 'игры', 'игра'].includes(lc)) mappedCategories.push('Игры');
  });

  const normalizedActiveCategories = Array.from(new Set(mappedCategories));
  const displayCategories: string[] = normalizedActiveCategories.length > 0 ? normalizedActiveCategories : canonicalCategories;

  // Search catalog in DB when searchQuery changes
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setCatalogResults([]);
      setIsSearchingCatalog(false);
      return;
    }

    setIsSearchingCatalog(true);
    const timer = setTimeout(async () => {
      try {
        const catFilter = title === 'Все' ? undefined : title;
        const res = await api.searchCatalog(q, catFilter);
        setCatalogResults(res || []);
      } catch (e) {
        console.warn('Search catalog error:', e);
      } finally {
        setIsSearchingCatalog(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, title]);

  const userItemTitles = new Set(items.map((i) => (i.title || '').trim().toLowerCase()));
  const externalCatalogResults = catalogResults.filter(
    (c) => !userItemTitles.has((c.title || '').trim().toLowerCase())
  );
  const dbCatalogResults = externalCatalogResults.filter((c) => c.source !== 'online');
  const onlineCatalogResults = externalCatalogResults.filter((c) => c.source === 'online');

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

  const sortedItems = [...filteredItems].sort((a, b) => {
    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
  });

  const mapCatalogToItem = (c: CatalogItem): Item => ({
    id: c.id || `cat_${c.title}`,
    title: c.title,
    category: c.category || 'Фильмы',
    status: 'planned',
    rating: 0,
    genre: c.genre || '',
    duration: c.duration || '',
    release_year: c.release_year || '',
    poster_url: c.poster_url || '',
    description: c.description || '',
    youtube_url: c.youtube_url || '',
    director: c.director || '',
    cast: c.cast || '',
    isSharedPreview: true,
  } as any);

  const isSearchActive = searchQuery.trim().length >= 2;

  return (
    <div className="space-y-3.5 animate-slide-up">
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

      {/* Row 1: Status Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-0.5">
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

      {/* Row 2: Strict App Categories Chips Only (Scrollable Horizontally) */}
      {onSelectCategory && (
        <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-0.5">
          <button
            onClick={() => onSelectCategory('Все')}
            className={`px-3.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition ${
              title === 'Все'
                ? 'bg-accentTeal text-white shadow-md shadow-accentTeal/30 font-bold'
                : 'bg-cardDark border border-cardBorder text-gray-300 hover:border-gray-600'
            }`}
          >
            {t.recently_added.see_all}
          </button>
          {displayCategories.map((catKey) => {
            const isSelected = title.toLowerCase() === catKey.toLowerCase();
            return (
              <button
                key={catKey}
                onClick={() => onSelectCategory(catKey)}
                className={`px-3.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                  isSelected
                    ? 'bg-accentTeal text-white shadow-md shadow-accentTeal/30 font-bold'
                    : 'bg-cardDark border border-cardBorder text-gray-300 hover:border-gray-600'
                }`}
              >
                {getTranslatedCategoryTitle(catKey)}
              </button>
            );
          })}
        </div>
      )}

      {/* Subheader count & working sort button when not actively searching */}
      {!isSearchActive && (
        <div className="flex items-center justify-between text-xs text-gray-400 pt-0.5">
          <span>{sortedItems.length} {t.details.elements_count}</span>
          <button
            onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
            className="flex items-center gap-1 text-gray-300 hover:text-white font-medium transition active:scale-95"
            title="Сортировать по дате"
          >
            <span>{t.details.by_date}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-accentViolet transition-transform duration-200 ${sortOrder === 'asc' ? 'rotate-180' : ''}`} />
          </button>
        </div>
      )}

      {/* Content Rendering */}
      {!isSearchActive ? (
        /* Normal View (User Items List) */
        <div className="space-y-2.5">
          {sortedItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onSelect={onSelectItem}
              showCheckbox={true}
              onToggleStatus={() => onToggleStatus(item)}
              t={t}
            />
          ))}

          {sortedItems.length === 0 && (
            <div className="text-center py-10 text-xs text-gray-500">
              {t.details.no_items_found}
            </div>
          )}
        </div>
      ) : (
        /* Dual Search View: User List + Global Catalog Results */
        <div className="space-y-5 pt-1">
          {/* Section 1: User's Own List */}
          {sortedItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-300 px-1">
                <FolderCheck className="w-4 h-4 text-accentTeal" />
                <span>В вашем списке ({sortedItems.length})</span>
              </div>
              <div className="space-y-2.5">
                {sortedItems.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    onSelect={onSelectItem}
                    showCheckbox={true}
                    onToggleStatus={() => onToggleStatus(item)}
                    t={t}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Section 2: Global Database Results */}
          {dbCatalogResults.length > 0 && (
            <div>
              <div className="flex items-center justify-between text-xs font-bold text-gray-300 px-1 mb-2">
                <div className="flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-accentViolet" />
                  <span>В общей базе LISTA</span>
                </div>
              </div>

              <div className="space-y-2.5">
                {dbCatalogResults.map((catItem, idx) => {
                  const mapped = mapCatalogToItem(catItem);
                  return (
                    <ItemCard
                      key={catItem.id || `cat_db_${catItem.title}_${idx}`}
                      item={mapped}
                      onSelect={() => onSelectItem(mapped)}
                      onAdd={() => onAddCatalogItem && onAddCatalogItem(catItem)}
                      t={t}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 3: Internet Search Results (TMDb, iTunes, TVMaze, Wikipedia) */}
          <div>
            <div className="flex items-center justify-between text-xs font-bold text-gray-300 px-1 mb-2">
              <div className="flex items-center gap-1.5">
                <SearchIcon className="w-4 h-4 text-accentBlue" />
                <span>Поиск в интернете</span>
              </div>
              {isSearchingCatalog && (
                <div className="flex items-center gap-1 text-[11px] text-gray-400 font-normal">
                  <Loader2 className="w-3 h-3 animate-spin text-accentBlue" />
                  <span>Ищем...</span>
                </div>
              )}
            </div>

            {onlineCatalogResults.length > 0 ? (
              <div className="space-y-2.5">
                {onlineCatalogResults.map((catItem, idx) => {
                  const mapped = mapCatalogToItem(catItem);
                  return (
                    <ItemCard
                      key={catItem.id || `cat_online_${catItem.title}_${idx}`}
                      item={mapped}
                      onSelect={() => onSelectItem(mapped)}
                      onAdd={() => onAddCatalogItem && onAddCatalogItem(catItem)}
                      t={t}
                    />
                  );
                })}
              </div>
            ) : !isSearchingCatalog ? (
              <div className="glass-card p-4 rounded-2xl text-center text-xs text-gray-400 space-y-1">
                {sortedItems.length === 0 && dbCatalogResults.length === 0 ? (
                  <p>Ничего не найдено в интернете</p>
                ) : (
                  <p className="text-gray-500">Больше совпадений нет</p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
