import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Sparkles, RefreshCw, Wand2 } from 'lucide-react';
import { Item, CatalogItem } from '../types';
import { ItemCard } from './ItemCard';
import { Translations } from '../services/i18n';
import { api } from '../services/api';

interface ListRecommendationsProps {
  listId: string;
  listTitle: string;
  listItems: Item[];
  allItems?: Item[];
  onBack: () => void;
  onSelectItem: (item: Item) => void;
  onAddCatalogItem: (catalogItem: CatalogItem) => Promise<Item | undefined> | Item | undefined;
  onToggleStatus: (item: Item, e: React.MouseEvent) => void;
  onUpdateItem: (id: string, updates: Partial<Item>) => void;
  cachedResults?: CatalogItem[];
  onUpdateCachedResults: (results: CatalogItem[]) => void;
  cachedAddedItems?: Item[];
  onUpdateCachedAddedItems: (items: Item[]) => void;
  t: Translations;
}

const normalizeTitle = (title?: string): string => {
  if (!title) return '';
  let str = title.toLowerCase().trim();
  str = str.replace(/ё/g, 'е');
  str = str.replace(/[\(\[\{][^\)\]\}]*[\)\]\}]/g, ' ');
  str = str.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  return str.replace(/\s+/g, ' ').trim();
};

const extractFranchiseRoots = (title?: string): string[] => {
  if (!title) return [];
  let s = title.trim();
  const roots = new Set<string>();

  s = s.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ').replace(/\{[^}]*\}/g, ' ');
  s = s.replace(/ё/g, 'е').replace(/Ё/g, 'е');

  const normFull = normalizeTitle(s);
  if (normFull) roots.add(normFull);

  // Strip season/part/case patterns
  let stripped = s.replace(
    /(?:[.:\-\—\/|]\s*)?(?:дело\s*(?:№|no)?|сезон|season|часть|part|эпизод|episode|глава|chapter|vol|volume|выпуск|книга|book|фильм|film)\s*(?:№|no)?\s*[\dIVXLCDMivxlcdm]+(?:\s*[:.\-\—]\s*.*)?$/i,
    ''
  );
  stripped = stripped.replace(
    /\s+(?:дело\s*(?:№|no)?|сезон|season|часть|part|эпизод|episode|глава|chapter|vol|volume|выпуск|книга|book)\s*(?:№|no)?\s*[\dIVXLCDMivxlcdm]+.*$/i,
    ''
  );

  const parts = stripped.split(/[\.:\-—–\/|,]/).map((p) => p.trim()).filter(Boolean);
  for (const p of parts) {
    const pClean = p.replace(/\s+[\dIVXLCDMivxlcdm]+$/i, '');
    const pNorm = normalizeTitle(pClean);
    if (pNorm.length >= 3) {
      roots.add(pNorm);
    }
  }

  if (/\s+и\s+/i.test(stripped)) {
    const beforeAnd = stripped.split(/\s+и\s+/i)[0].trim();
    const beforeAndNorm = normalizeTitle(beforeAnd);
    if (beforeAndNorm.length >= 4) {
      roots.add(beforeAndNorm);
    }
  }

  return Array.from(roots);
};

const isTitleMatch = (t1?: string, t2?: string): boolean => {
  if (!t1 || !t2) return false;
  const norm1 = normalizeTitle(t1);
  const norm2 = normalizeTitle(t2);
  if (!norm1 || !norm2) return false;
  if (norm1 === norm2) return true;

  const roots1 = extractFranchiseRoots(t1);
  const roots2 = extractFranchiseRoots(t2);

  for (const r1 of roots1) {
    for (const r2 of roots2) {
      if (r1.length >= 3 && r1 === r2) return true;
    }
  }

  return false;
};

export const ListRecommendations: React.FC<ListRecommendationsProps> = ({
  listId,
  listTitle,
  listItems,
  allItems,
  onBack,
  onSelectItem,
  onAddCatalogItem,
  onToggleStatus,
  onUpdateItem,
  cachedResults,
  onUpdateCachedResults,
  cachedAddedItems,
  onUpdateCachedAddedItems,
  t,
}) => {
  const [recommendations, setRecommendations] = useState<CatalogItem[]>(cachedResults || []);
  const [addedItems, setAddedItems] = useState<Item[]>(cachedAddedItems || []);
  const [isLoading, setIsLoading] = useState<boolean>(!cachedResults || cachedResults.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerHaptic = (type: 'light' | 'medium' = 'light') => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.impactOccurred(type);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const isCurrentUserAdmin = (): boolean => {
    try {
      const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
      if (tgUser?.id === 214993606) return true;
      if (tgUser?.username && ['neznayca', 'znayca'].includes(tgUser.username.toLowerCase())) return true;
    } catch (e) {}
    return false;
  };

  const fetchRecommendations = async (force: boolean = false) => {
    if (!force && cachedResults && cachedResults.length > 0) {
      return;
    }

    const isAdmin = isCurrentUserAdmin();

    if (force) {
      if (!isAdmin) {
        const now = Date.now();
        const lastRefreshKey = `lista_rec_last_refresh_${listId}`;
        const lastTime = parseInt(localStorage.getItem(lastRefreshKey) || '0', 10);
        const elapsedSec = Math.floor((now - lastTime) / 1000);
        const COOLDOWN_SEC = 300; // 5 minutes

        if (lastTime > 0 && elapsedSec < COOLDOWN_SEC) {
          const remaining = COOLDOWN_SEC - elapsedSec;
          const remMin = Math.floor(remaining / 60);
          const remSec = remaining % 60;
          showToast(`Подождите ${remMin} мин. ${remSec} сек. перед повторным обновлением.`);
          return;
        }
      } else {
        localStorage.removeItem(`lista_rec_last_refresh_${listId}`);
      }

      setAddedItems([]);
      onUpdateCachedAddedItems([]);
    }

    setIsLoading(true);
    setError(null);

    try {
      const itemIds = listItems.map((i) => i.id).filter(Boolean);
      const itemTitles = listItems.map((i) => {
        let desc = i.title;
        const details: string[] = [];
        if (i.release_year) details.push(i.release_year);
        if (i.genre) details.push(i.genre);
        if (i.country) details.push(`Страна: ${i.country}`);
        if (i.director) details.push(`Режиссер: ${i.director}`);
        if (i.author) details.push(`Автор: ${i.author}`);
        if (details.length > 0) desc += ` [${details.join(', ')}]`;
        return desc;
      }).filter(Boolean);

      // Determine main category
      const catCountMap: Record<string, number> = {};
      listItems.forEach((item) => {
        const cat = item.category || 'Фильмы';
        catCountMap[cat] = (catCountMap[cat] || 0) + 1;
      });
      let primaryCategory = 'Фильмы';
      let maxCount = 0;
      Object.entries(catCountMap).forEach(([cat, count]) => {
        if (count > maxCount) {
          maxCount = count;
          primaryCategory = cat;
        }
      });

      const results = await api.getRecommendations(
        listId,
        itemIds,
        itemTitles,
        primaryCategory,
        listTitle
      );

      if (results && results.length > 0) {
        if (force && !isAdmin) {
          localStorage.setItem(`lista_rec_last_refresh_${listId}`, Date.now().toString());
        }
        const userItemsToFilter = allItems && allItems.length > 0 ? allItems : listItems;
        const seenFranchiseKeys = new Set<string>();
        const cleanResults: CatalogItem[] = [];
        for (const c of results) {
          if (!c.title || !c.title.trim()) continue;
          if (userItemsToFilter.some((userItem) => isTitleMatch(c.title, userItem.title))) {
            continue;
          }
          const roots = extractFranchiseRoots(c.title);
          const primaryKey = roots.length > 0 ? roots[roots.length - 1] : normalizeTitle(c.title);
          if (primaryKey && seenFranchiseKeys.has(primaryKey)) {
            continue;
          }
          if (primaryKey) {
            seenFranchiseKeys.add(primaryKey);
          }
          cleanResults.push(c);
        }
        setRecommendations(cleanResults);
        onUpdateCachedResults(cleanResults);
        // Trigger background poster enrichment for items missing poster_url
        enrichMissingPosters(cleanResults);
      } else {
        setError('Не удалось загрузить рекомендации.');
      }
    } catch (err: any) {
      const msg = err?.message || 'Ошибка при загрузке рекомендаций.';
      setError(msg);
      showToast(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Track which titles we've already tried to enrich to avoid redundant requests
  const enrichedTitles = useRef<Set<string>>(new Set());

  // Background poster enrichment: for items without poster_url, fetch from catalog search
  const enrichMissingPosters = async (items: CatalogItem[]) => {
    const missing = items.filter(
      (c) => !c.poster_url || !c.poster_url.trim()
    );
    if (missing.length === 0) return;

    for (const catItem of missing) {
      const key = `${catItem.title}__${catItem.category || ''}`;
      if (enrichedTitles.current.has(key)) continue;
      enrichedTitles.current.add(key);

      // Fire and forget — update poster when found
      api.searchCatalog(catItem.title, catItem.category).then((results) => {
        if (!results || results.length === 0) return;
        const match = results.find((r: any) => r.poster_url && r.poster_url.trim()) || null;
        if (!match || !match.poster_url) return;
        setRecommendations((prev) => {
          const updated = prev.map((r) =>
            r.title === catItem.title && r.category === catItem.category
              ? { ...r, poster_url: match.poster_url }
              : r
          );
          onUpdateCachedResults(updated);
          return updated;
        });
      }).catch(() => {});
    }
  };

  useEffect(() => {
    fetchRecommendations(false);
  }, [listId]);

  // If we loaded from cache but some items are missing posters, enrich them
  useEffect(() => {
    if (cachedResults && cachedResults.length > 0) {
      enrichMissingPosters(cachedResults);
    }
  }, []);

  useEffect(() => {
    if (cachedAddedItems) {
      setAddedItems(cachedAddedItems);
    }
  }, [cachedAddedItems]);

  const mapCatalogToItem = (c: CatalogItem): Item => ({
    id: c.id || '',
    user_id: 0,
    title: c.title,
    category: c.category || 'Фильмы',
    status: 'planned',
    rating: 0,
    genre: c.genre || '',
    duration: c.duration || '',
    release_year: c.release_year || '',
    poster_url: c.poster_url || '',
    description: c.description || '',
    note: '',
    youtube_url: c.youtube_url || '',
    director: c.director || '',
    cast: c.cast || '',
    author: c.author || '',
    isbn: c.isbn || '',
    public_rating: c.public_rating || '',
    country: c.country || '',
    isSharedPreview: true,
  });

  const handleAddItem = async (catItem: CatalogItem, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic();
    const createdItem = await onAddCatalogItem(catItem);
    
    // Add to our local addedItems list for display with isSharedPreview: false so status/genre can be edited
    const itemToAdd: Item = createdItem ? { ...createdItem, isSharedPreview: false } : { ...mapCatalogToItem(catItem), isSharedPreview: false };
    const updatedAdded = [itemToAdd, ...addedItems.filter((i) => i.id !== itemToAdd.id)];
    setAddedItems(updatedAdded);
    onUpdateCachedAddedItems(updatedAdded);

    setRecommendations((prev) => {
      const updated = prev.filter((item) => item.id !== catItem.id);
      onUpdateCachedResults(updated);
      return updated;
    });
    showToast(`«${catItem.title}» добавлено в вашу коллекцию!`);
  };

  return (
    <div className="space-y-4 pb-12 animate-slide-up">
      {/* Header Bar */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            triggerHaptic();
            onBack();
          }}
          className="p-2.5 rounded-2xl bg-cardDark border border-cardBorder text-gray-300 hover:text-white hover:border-accentViolet/50 transition active:scale-95 shadow-sm"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
            <Sparkles className="w-3.5 h-3.5 fill-amber-400" />
            <span>ИИ-подборка</span>
          </div>
          <h1 className="text-base font-bold text-white truncate">
            Рекомендации для: <span className="text-accentViolet">{listTitle}</span>
          </h1>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="space-y-3 pt-2">
          <div className="glass-card p-4 rounded-2xl flex items-center justify-between border-amber-500/20 bg-amber-500/5">
            <div className="flex items-center gap-2 text-xs text-amber-300 font-medium">
              <Wand2 className="w-4 h-4 animate-spin text-amber-400" />
              <span>Нейросеть анализирует ваш список и подбирает лучшее...</span>
            </div>
          </div>

          {/* Skeleton Loaders */}
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="glass-card p-3 rounded-2xl border border-cardBorder/60 animate-pulse flex items-center gap-3.5 h-24"
            >
              <div className="w-14 h-20 bg-cardBorder/50 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-4 bg-cardBorder/60 rounded-md w-3/4" />
                <div className="h-3 bg-cardBorder/40 rounded-md w-1/2" />
                <div className="h-3 bg-cardBorder/30 rounded-md w-1/3" />
              </div>
              <div className="w-8 h-8 rounded-xl bg-cardBorder/40 shrink-0" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="glass-card p-8 rounded-3xl text-center space-y-4 border-dashed border-red-500/30">
          <Wand2 className="w-10 h-10 mx-auto text-amber-400 opacity-80" />
          <p className="text-xs text-gray-300 font-medium">{error}</p>
          <button
            onClick={() => {
              triggerHaptic();
              fetchRecommendations(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accentViolet text-white text-xs font-bold shadow-md hover:bg-opacity-90 transition active:scale-95"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Попробовать снова</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3 pt-1">
          {addedItems.length > 0 && (
            <div className="space-y-2.5 mb-6">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">
                В вашем списке
              </h2>
              {addedItems.map((item) => (
                <ItemCard
                  key={`added_${item.id}`}
                  item={item}
                  onSelect={onSelectItem}
                  onToggleStatus={(itemToToggle, e) => {
                    onToggleStatus(itemToToggle, e);
                    const nextStatus = itemToToggle.status === 'completed' ? 'planned' : 'completed';
                    const updated = addedItems.map((ai) => ai.id === itemToToggle.id ? { ...ai, status: nextStatus } : ai);
                    setAddedItems(updated);
                    onUpdateCachedAddedItems(updated);
                  }}
                  onUpdateItem={(id, updates) => {
                    onUpdateItem(id, updates);
                    const updated = addedItems.map((ai) => ai.id === id ? { ...ai, ...updates } : ai);
                    setAddedItems(updated);
                    onUpdateCachedAddedItems(updated);
                  }}
                  t={t}
                />
              ))}
            </div>
          )}

          {(() => {
            const userItemsToFilter = allItems && allItems.length > 0 ? allItems : listItems;
            const seenRenderKeys = new Set<string>();
            const filteredRecommendations = recommendations.filter((rec) => {
              if (!rec.title || !rec.title.trim()) return false;
              if (userItemsToFilter.some((userItem) => isTitleMatch(rec.title, userItem.title))) {
                return false;
              }
              const roots = extractFranchiseRoots(rec.title);
              const primaryKey = roots.length > 0 ? roots[roots.length - 1] : normalizeTitle(rec.title);
              if (primaryKey && seenRenderKeys.has(primaryKey)) {
                return false;
              }
              if (primaryKey) {
                seenRenderKeys.add(primaryKey);
              }
              return true;
            });
            return (
              <>
                <div className="flex items-center justify-between px-1 text-xs text-gray-400">
                  <span>Найдено {filteredRecommendations.length} новых рекомендаций</span>
                  <button
                    onClick={() => {
                      triggerHaptic();
                      fetchRecommendations(true);
                    }}
                    className="flex items-center gap-1 text-accentViolet font-semibold hover:underline active:scale-95 transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Обновить</span>
                  </button>
                </div>

                <div className="space-y-2.5">
                  {filteredRecommendations.map((catItem, idx) => {
                    const mappedItem = mapCatalogToItem(catItem);
                    return (
                      <ItemCard
                        key={catItem.id || `rec_item_${idx}`}
                        item={mappedItem}
                        onSelect={onSelectItem}
                        onAdd={(item, e) => handleAddItem(catItem, e)}
                        t={t}
                      />
                    );
                  })}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-accentViolet/95 backdrop-blur-md text-white text-xs font-semibold px-4 py-2.5 rounded-2xl shadow-2xl animate-fade-in text-center max-w-[85vw] border border-white/20">
          {toastMessage}
        </div>
      )}
    </div>
  );
};
