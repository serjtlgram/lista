import React, { useState, useEffect } from 'react';
import { ChevronLeft, Sparkles, RefreshCw, Wand2 } from 'lucide-react';
import { Item, CatalogItem } from '../types';
import { ItemCard } from './ItemCard';
import { Translations } from '../services/i18n';
import { api } from '../services/api';

interface ListRecommendationsProps {
  listId: string;
  listTitle: string;
  listItems: Item[];
  onBack: () => void;
  onSelectItem: (item: Item) => void;
  onAddCatalogItem: (catalogItem: CatalogItem) => void;
  t: Translations;
}

export const ListRecommendations: React.FC<ListRecommendationsProps> = ({
  listId,
  listTitle,
  listItems,
  onBack,
  onSelectItem,
  onAddCatalogItem,
  t,
}) => {
  const [recommendations, setRecommendations] = useState<CatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
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

  const fetchRecommendations = async () => {
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
        setRecommendations(results);
      } else {
        setError('Не удалось загрузить рекомендации. Попробуйте еще раз.');
      }
    } catch (err) {
      console.error('Error fetching recommendations:', err);
      setError('Произошла ошибка при загрузке рекомендаций.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecommendations();
  }, [listId]);

  const mapCatalogToItem = (c: CatalogItem): Item => ({
    id: c.id || `rec_${Math.random().toString(36).substring(2, 9)}`,
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
  });

  const handleAddItem = (catItem: CatalogItem, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic();
    onAddCatalogItem(catItem);
    setRecommendations((prev) => prev.filter((item) => item.id !== catItem.id));
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
              fetchRecommendations();
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accentViolet text-white text-xs font-bold shadow-md hover:bg-opacity-90 transition active:scale-95"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Попробовать снова</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between px-1 text-xs text-gray-400">
            <span>Найдено {recommendations.length} новых рекомендаций</span>
            <button
              onClick={() => {
                triggerHaptic();
                fetchRecommendations();
              }}
              className="flex items-center gap-1 text-accentViolet font-semibold hover:underline active:scale-95 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Обновить</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {recommendations.map((catItem, idx) => {
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
