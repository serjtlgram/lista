import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, Search as SearchIcon, ChevronDown, Globe, FolderCheck, Loader2, X } from 'lucide-react';
import { Item, CatalogItem } from '../types';
import { ItemCard } from './ItemCard';
import { Translations } from '../services/i18n';
import { api } from '../services/api';
import { getAvailableGenres, getTranslatedGenreFull } from '../services/genres';

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
  onUpdateItem?: (id: string, updates: Partial<Item>) => void;
  onAddCatalogItem?: (catalogItem: CatalogItem) => void;
  t: Translations;
}

const CategoryScreenComponent: React.FC<CategoryScreenProps> = ({
  title,
  items,
  activeCategories = [],
  searchQuery: searchQueryProp = '',
  onSearchQueryChange,
  onSelectCategory,
  onBack,
  onSelectItem,
  onToggleStatus,
  onUpdateItem,
  onAddCatalogItem,
  t,
}) => {
  const [activeFilterKey, setActiveFilterKey] = useState<'all' | 'watching' | 'completed' | 'planned'>(() => {
    const saved = localStorage.getItem('lista_catalog_status_filter');
    if (saved === 'watching' || saved === 'completed' || saved === 'planned') return saved;
    return 'all';
  });

  useEffect(() => {
    localStorage.setItem('lista_catalog_status_filter', activeFilterKey);
  }, [activeFilterKey]);

  const [internalQuery, setInternalQuery] = useState(searchQueryProp);
  const searchQuery = onSearchQueryChange ? searchQueryProp : internalQuery;
  const setSearchQuery = (q: string) => {
    setInternalQuery(q);
    if (onSearchQueryChange) onSearchQueryChange(q);
  };
  const [showSearchInput, setShowSearchInput] = useState(true);
  const [searchMode, setSearchMode] = useState<'title' | 'actor' | 'director'>(() => {
    const saved = localStorage.getItem('lista_catalog_search_mode');
    if (saved === 'actor' || saved === 'director' || saved === 'title') return saved;
    return 'title';
  });

  useEffect(() => {
    localStorage.setItem('lista_catalog_search_mode', searchMode);
  }, [searchMode]);

  const [sortBy, setSortBy] = useState<'date' | 'year' | 'rating'>(() => {
    const saved = localStorage.getItem('lista_catalog_sort_by');
    if (saved === 'year' || saved === 'rating' || saved === 'date') return saved;
    return 'date';
  });
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>(() => {
    const saved = localStorage.getItem('lista_catalog_sort_order');
    if (saved === 'asc' || saved === 'desc') return saved;
    return 'desc';
  });

  useEffect(() => {
    localStorage.setItem('lista_catalog_sort_by', sortBy);
  }, [sortBy]);

  useEffect(() => {
    localStorage.setItem('lista_catalog_sort_order', sortOrder);
  }, [sortOrder]);

  const [catalogResults, setCatalogResults] = useState<CatalogItem[]>(() => {
    try {
      const saved = sessionStorage.getItem('lista_catalog_search_results');
      const savedQuery = sessionStorage.getItem('lista_catalog_search_query');
      const savedMode = sessionStorage.getItem('lista_catalog_search_mode_cached');
      const currentQ = (onSearchQueryChange ? searchQueryProp : internalQuery).trim();
      const currentM = localStorage.getItem('lista_catalog_search_mode') || 'title';
      if (saved && savedQuery === currentQ && savedMode === currentM) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [];
  });

  useEffect(() => {
    try {
      const q = searchQuery.trim();
      if (q.length >= 1 && catalogResults.length > 0) {
        sessionStorage.setItem('lista_catalog_search_results', JSON.stringify(catalogResults));
        sessionStorage.setItem('lista_catalog_search_query', q);
        sessionStorage.setItem('lista_catalog_search_mode_cached', searchMode);
      } else if (q.length < 1) {
        sessionStorage.removeItem('lista_catalog_search_results');
        sessionStorage.removeItem('lista_catalog_search_query');
        sessionStorage.removeItem('lista_catalog_search_mode_cached');
      }
    } catch (e) {}
  }, [catalogResults, searchQuery, searchMode]);

  const [isSearchingCatalog, setIsSearchingCatalog] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('lista_catalog_genre_filter');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem('lista_catalog_genre_filter', JSON.stringify(selectedGenres));
    } catch (e) {}
  }, [selectedGenres]);

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
    if (['game', 'games', 'игры', 'игра'].includes(lc)) return t.categories.games;
    return catTitle;
  };

  // Map activeCategories strictly to canonical known categories only
  const canonicalCategories = ['Фильмы', 'Сериалы', 'Книги', 'Игры'];

  const mappedCategories: string[] = [];
  activeCategories.forEach((c) => {
    const lc = (c || '').toLowerCase().trim();
    if (['movie', 'movies', 'фильмы', 'фильм'].includes(lc)) mappedCategories.push('Фильмы');
    else if (['show', 'shows', 'series', 'сериалы', 'сериал'].includes(lc)) mappedCategories.push('Сериалы');
    else if (['book', 'books', 'книги', 'книга'].includes(lc)) mappedCategories.push('Книги');
    else if (['game', 'games', 'игры', 'игра'].includes(lc)) mappedCategories.push('Игры');
  });

  const normalizedActiveSet = new Set(mappedCategories);
  const displayCategories: string[] = normalizedActiveSet.size > 0
    ? canonicalCategories.filter((cat) => normalizedActiveSet.has(cat))
    : canonicalCategories;

  // Search catalog in DB when searchQuery changes (500ms debounce, length >= 1)
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 1) {
      setCatalogResults([]);
      setIsSearchingCatalog(false);
      return;
    }

    // Check if we already have cached results for this exact query & mode on mount
    try {
      const saved = sessionStorage.getItem('lista_catalog_search_results');
      const savedQuery = sessionStorage.getItem('lista_catalog_search_query');
      const savedMode = sessionStorage.getItem('lista_catalog_search_mode_cached');
      if (saved && savedQuery === q && savedMode === searchMode && catalogResults.length > 0) {
        return;
      }
    } catch (e) {}

    setIsSearchingCatalog(true);
    const timer = setTimeout(async () => {
      try {
        const catFilter = title === 'Все' ? undefined : title;
        const res = await api.searchCatalog(q, catFilter, undefined, searchMode);
        setCatalogResults(res || []);
      } catch (e) {
        console.warn('Search catalog error:', e);
      } finally {
        setIsSearchingCatalog(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, title, searchMode]);

  const normCatKey = (c?: string) => {
    const lc = (c || '').toLowerCase().trim();
    if (['movie', 'movies', 'фильмы', 'фильм'].includes(lc)) return 'movie';
    if (['show', 'shows', 'series', 'сериалы', 'сериал'].includes(lc)) return 'series';
    if (['book', 'books', 'книги', 'книга'].includes(lc)) return 'book';
    if (['game', 'games', 'игры', 'игра'].includes(lc)) return 'game';
    return lc;
  };

  const isCategoryMatch = (itemCat: string, tabTitle: string): boolean => {
    const tLower = (tabTitle || '').toLowerCase().trim();
    if (tLower === 'все' || tLower === 'all' || !tLower) return true;
    const cLower = (itemCat || '').toLowerCase().trim();

    const isMovie = ['movie', 'movies', 'фильмы', 'фильм'].includes(cLower);
    const isShow = ['show', 'shows', 'series', 'сериалы', 'сериал'].includes(cLower);
    const isBook = ['book', 'books', 'книги', 'книга'].includes(cLower);
    const isGame = ['game', 'games', 'игры', 'игра'].includes(cLower);

    if (['movie', 'movies', 'фильмы', 'фильм'].includes(tLower)) {
      return isMovie || isShow;
    }
    if (['show', 'shows', 'series', 'сериалы', 'сериал'].includes(tLower)) {
      return isShow || isMovie;
    }
    if (['book', 'books', 'книги', 'книга'].includes(tLower)) {
      return isBook;
    }
    if (['game', 'games', 'игры', 'игра'].includes(tLower)) {
      return isGame;
    }
    return true;
  };

  const getTabCategoryPriority = (itemCat: string, tabTitle: string): number => {
    const tLower = (tabTitle || '').toLowerCase().trim();
    const cLower = (itemCat || '').toLowerCase().trim();

    const isMovie = ['movie', 'movies', 'фильмы', 'фильм'].includes(cLower);
    const isShow = ['show', 'shows', 'series', 'сериалы', 'сериал'].includes(cLower);
    const isBook = ['book', 'books', 'книги', 'книга'].includes(cLower);
    const isGame = ['game', 'games', 'игры', 'игра'].includes(cLower);

    if (tLower === 'все' || tLower === 'all' || !tLower) {
      if (isMovie) return 1;
      if (isShow) return 2;
      if (isBook) return 3;
      if (isGame) return 4;
      return 5;
    }

    if (['movie', 'movies', 'фильмы', 'фильм'].includes(tLower)) {
      if (isMovie) return 1;
      if (isShow) return 2;
      return 3;
    }

    if (['show', 'shows', 'series', 'сериалы', 'сериал'].includes(tLower)) {
      if (isShow) return 1;
      if (isMovie) return 2;
      return 3;
    }

    return 1;
  };

  const { sortedItems, dbCatalogResults, onlineCatalogResults } = useMemo(() => {
    const userExactKeys = new Set<string>();
    const userVideoTitleYearKeys = new Set<string>();

    items.forEach((i) => {
      const titleClean = (i.title || '').trim().toLowerCase();
      const catNorm = normCatKey(i.category);
      if (!titleClean) return;
      userExactKeys.add(`${titleClean}::${catNorm}`);
      if (catNorm === 'movie' || catNorm === 'series') {
        const yearClean = (i.release_year || '').trim();
        if (yearClean) {
          userVideoTitleYearKeys.add(`${titleClean}::${yearClean}`);
        }
        userVideoTitleYearKeys.add(titleClean);
      }
    });

    const externalCatalogResults = catalogResults.filter((c) => {
      const titleClean = (c.title || '').trim().toLowerCase();
      const catNorm = normCatKey(c.category);
      if (!titleClean) return false;

      // 1. Exact match by category
      if (userExactKeys.has(`${titleClean}::${catNorm}`)) return false;

      // 2. Cross-media match for movie/series already in user's collection
      if (catNorm === 'movie' || catNorm === 'series') {
        const yearClean = (c.release_year || '').trim();
        if (yearClean && userVideoTitleYearKeys.has(`${titleClean}::${yearClean}`)) {
          return false;
        }
        if (userVideoTitleYearKeys.has(titleClean)) {
          return false;
        }
      }

      return true;
    });

    const dbResults = externalCatalogResults.filter((c) => c.source !== 'online');
    const onlineResults = externalCatalogResults.filter((c) => c.source === 'online');

    const filtered = items.filter((item) => {
      if (!isCategoryMatch(item.category, title)) return false;

      if (activeFilterKey === 'watching' && item.status !== 'watching' && item.status !== 'Смотрю' && item.status !== 'Читаю' && item.status !== 'Граю') return false;
      if (activeFilterKey === 'completed' && item.status !== 'completed' && item.status !== 'Просмотрено' && item.status !== 'Завершено' && item.status !== 'Прочитано' && item.status !== 'Пройдено') return false;
      if (activeFilterKey === 'planned' && item.status !== 'planned' && item.status !== 'Отложено' && item.status !== 'В планах' && item.status !== 'У планах') return false;

      if (selectedGenres.length > 0) {
        const itemGenre = getTranslatedGenreFull(item.genre, t);
        if (!selectedGenres.includes(itemGenre)) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (searchMode === 'actor') {
          const castStr = `${item.cast || ''} ${item.cast_roles || ''}`.toLowerCase();
          return castStr.includes(q);
        }
        if (searchMode === 'director') {
          return (item.director || '').toLowerCase().includes(q);
        }
        return item.title.toLowerCase().includes(q) || (item.genre && item.genre.toLowerCase().includes(q));
      }

      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      const qTrim = searchQuery.trim().toLowerCase();
      if (qTrim) {
        const getScore = (it: Item) => {
          if (searchMode === 'actor') {
            const castStr = `${it.cast || ''} ${it.cast_roles || ''}`.toLowerCase();
            if (castStr === qTrim) return 1;
            if (castStr.startsWith(qTrim)) return 2;
            return 3;
          }
          if (searchMode === 'director') {
            const dir = (it.director || '').toLowerCase();
            if (dir === qTrim) return 1;
            if (dir.startsWith(qTrim)) return 2;
            return 3;
          }
          const tLower = (it.title || '').toLowerCase();
          if (tLower === qTrim) return 1;
          if (tLower.startsWith(qTrim)) return 2;
          if (tLower.includes(' ' + qTrim) || tLower.includes('«' + qTrim) || tLower.includes('"' + qTrim)) return 3;
          return 4;
        };
        const scoreA = getScore(a);
        const scoreB = getScore(b);
        if (scoreA !== scoreB) return scoreA - scoreB;
      }

      const prioA = getTabCategoryPriority(a.category, title);
      const prioB = getTabCategoryPriority(b.category, title);
      if (prioA !== prioB) return prioA - prioB;

      if (sortBy === 'year') {
        const yearStrA = (a.release_year || '').toString();
        const yearStrB = (b.release_year || '').toString();
        const matchA = yearStrA.match(/\d{4}/);
        const matchB = yearStrB.match(/\d{4}/);
        const yearA = matchA ? parseInt(matchA[0], 10) : 0;
        const yearB = matchB ? parseInt(matchB[0], 10) : 0;

        if (yearA !== yearB) {
          if (yearA === 0) return 1;
          if (yearB === 0) return -1;
          return sortOrder === 'desc' ? yearB - yearA : yearA - yearB;
        }
      }

      if (sortBy === 'rating') {
        const ratingA = parseFloat(a.public_rating || '0') || 0;
        const ratingB = parseFloat(b.public_rating || '0') || 0;
        if (ratingA !== ratingB) {
          return sortOrder === 'desc' ? ratingB - ratingA : ratingA - ratingB;
        }
      }

      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });

    return {
      sortedItems: sorted,
      dbCatalogResults: dbResults,
      onlineCatalogResults: onlineResults,
    };
  }, [items, catalogResults, title, activeFilterKey, selectedGenres, searchQuery, sortBy, sortOrder, t]);

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
    author: c.author || '',
    isbn: c.isbn || '',
    public_rating: c.public_rating || '',
    country: c.country || '',
    isSharedPreview: true,
  } as any);

  const isSearchActive = searchQuery.trim().length >= 1;

  const availableGenres = useMemo(() => getAvailableGenres(title, t), [title, t]);

  const searchPlaceholder = useMemo(() => {
    if (searchMode === 'actor') return t.details.search_placeholder_actor;
    if (searchMode === 'director') return t.details.search_placeholder_director;
    return t.details.search_placeholder;
  }, [searchMode, t]);

  const searchModes = [
    { key: 'title', label: t.details.search_mode_title },
    { key: 'actor', label: t.details.search_mode_actor },
    { key: 'director', label: t.details.search_mode_director },
  ] as const;

  return (
    <div className="space-y-3.5">
      {showSearchInput && (
        <div className="space-y-2">
          {/* Mode Switcher Chips */}
          <div className="grid grid-cols-3 gap-1.5">
            {searchModes.map((mode) => (
              <button
                key={mode.key}
                type="button"
                onClick={() => setSearchMode(mode.key)}
                className={`py-1.5 px-2 rounded-xl text-xs font-semibold whitespace-nowrap transition text-center ${
                  searchMode === mode.key
                    ? 'bg-accentViolet text-white shadow-md shadow-accentViolet/30 font-bold'
                    : 'bg-cardDark border border-cardBorder text-gray-300 font-medium hover:border-gray-600 hover:text-white'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <div className="relative w-full">
            <input
              type="text"
              maxLength={100}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-bgDark border border-cardBorder rounded-xl p-2.5 pr-8 text-xs text-white focus:outline-none focus:border-accentViolet"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white p-1 focus:outline-none"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
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

      {/* Row 3: Genres Filter (Scrollable Horizontally) */}
      {availableGenres.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-0.5">
          <button
            onClick={() => setSelectedGenres([])}
            className={`px-3.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition ${
              selectedGenres.length === 0
                ? 'bg-accentViolet text-white shadow-md shadow-accentViolet/30 font-bold'
                : 'bg-cardDark border border-cardBorder text-gray-300 hover:border-gray-600'
            }`}
          >
            {t.recently_added.see_all}
          </button>
          {availableGenres.map((genreStr) => {
            const isSelected = selectedGenres.includes(genreStr);
            return (
              <button
                key={genreStr}
                onClick={() => {
                  setSelectedGenres(prev => {
                    if (prev.includes(genreStr)) return prev.filter(g => g !== genreStr);
                    return [...prev, genreStr];
                  });
                }}
                className={`px-3.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                  isSelected
                    ? 'bg-accentViolet text-white shadow-md shadow-accentViolet/30 font-bold'
                    : 'bg-cardDark border border-cardBorder text-gray-300 hover:border-gray-600'
                }`}
              >
                {genreStr}
              </button>
            );
          })}
        </div>
      )}

      {/* Subheader count & working sort buttons when not actively searching */}
      {!isSearchActive && (
        <div className="flex items-center justify-between text-xs text-gray-400 pt-0.5">
          <span>{sortedItems.length} {t.details.elements_count}</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (sortBy === 'year') {
                  setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                } else {
                  setSortBy('year');
                  setSortOrder('desc');
                }
              }}
              className={`flex items-center gap-1 font-medium transition active:scale-[0.97] ${
                sortBy === 'year' ? 'text-accentViolet font-semibold' : 'text-gray-300 hover:text-white'
              }`}
              title={t.details.by_year}
            >
              <span>{t.details.by_year}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  sortBy === 'year'
                    ? sortOrder === 'asc'
                      ? 'rotate-180 text-accentViolet'
                      : 'text-accentViolet'
                    : 'text-gray-400'
                }`}
              />
            </button>

            <button
              onClick={() => {
                if (sortBy === 'date') {
                  setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                } else {
                  setSortBy('date');
                  setSortOrder('desc');
                }
              }}
              className={`flex items-center gap-1 font-medium transition active:scale-[0.97] ${
                sortBy === 'date' ? 'text-accentViolet font-semibold' : 'text-gray-300 hover:text-white'
              }`}
              title={t.details.by_date}
            >
              <span>{t.details.by_date}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  sortBy === 'date'
                    ? sortOrder === 'asc'
                      ? 'rotate-180 text-accentViolet'
                      : 'text-accentViolet'
                    : 'text-gray-400'
                }`}
              />
            </button>
            <button
              onClick={() => {
                if (sortBy === 'rating') {
                  setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                } else {
                  setSortBy('rating');
                  setSortOrder('desc');
                }
              }}
              className={`flex items-center gap-1 font-medium transition active:scale-[0.97] ${
                sortBy === 'rating' ? 'text-accentViolet font-semibold' : 'text-gray-300 hover:text-white'
              }`}
              title={t.details.public_rating || 'Рейтинг'}
            >
              <span>{t.details.public_rating || 'Рейтинг'}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  sortBy === 'rating'
                    ? sortOrder === 'asc'
                      ? 'rotate-180 text-accentViolet'
                      : 'text-accentViolet'
                    : 'text-gray-400'
                }`}
              />
            </button>
          </div>
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
              onUpdateItem={onUpdateItem}
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
                <span>{(t.details.in_your_collection || 'В вашем списке')} ({sortedItems.length})</span>
              </div>
              <div className="space-y-2.5">
                {sortedItems.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    onSelect={onSelectItem}
                    showCheckbox={true}
                    onToggleStatus={() => onToggleStatus(item)}
                    onUpdateItem={onUpdateItem}
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
                  <span>{t.details.in_global_database || 'В общей базе LISTA'}</span>
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
                <span>{t.details.search_internet || 'Поиск в интернете'}</span>
              </div>
              {isSearchingCatalog && (
                <div className="flex items-center gap-1 text-[11px] text-gray-400 font-normal">
                  <Loader2 className="w-3 h-3 animate-spin text-accentBlue" />
                  <span>{t.details.searching_status || 'Ищем...'}</span>
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

export const CategoryScreen = React.memo(CategoryScreenComponent);
