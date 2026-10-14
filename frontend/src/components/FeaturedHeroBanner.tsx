import React, { useState, useMemo, useEffect } from 'react';
import {
  Play,
  Plus,
  ChevronLeft,
  ChevronRight,
  Star,
  Popcorn,
  Sparkles,
  BookmarkCheck,
} from 'lucide-react';
import { Item } from '../types';
import { getItemPoster } from '../services/posters';
import { Translations, formatCategorySingle } from '../services/i18n';
import { getTranslatedGenreShort } from '../services/genres';

interface FeaturedHeroBannerProps {
  items: Item[];
  onSelectItem: (item: Item) => void;
  onWatchTrailer: (item: Item) => void;
  onAddItemClick?: () => void;
  onBadgeClick?: () => void;
  t: Translations;
  className?: string;
}

// Preserves the user's current banner position across tab switches and back navigations during the app session.
// On app launch/refresh, it starts as null so a random banner is selected upon first viewing.
let sessionCatalogBannerIndex: number | null = null;

export const FeaturedHeroBanner: React.FC<FeaturedHeroBannerProps> = ({
  items,
  onSelectItem,
  onWatchTrailer,
  onAddItemClick,
  onBadgeClick,
  t,
  className = '',
}) => {
  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    return sessionCatalogBannerIndex ?? 0;
  });

  // Candidates: 1. From "Хочу посмотреть" (status: planned / в планах)
  // 2. If empty, fallback to recently added items
  const candidates = useMemo(() => {
    const isPlanned = (st?: string) => {
      const s = (st || '').toLowerCase().trim();
      return ['planned', 'в планах', 'у планах', 'отложено'].includes(s);
    };

    const plannedWithPosters = items.filter(
      (i) => isPlanned(i.status) && Boolean(i.poster_url && i.poster_url.trim())
    );
    if (plannedWithPosters.length > 0) return plannedWithPosters;

    const allPlanned = items.filter((i) => isPlanned(i.status));
    if (allPlanned.length > 0) return allPlanned;

    // Fallback: items with posters, prioritizing movies and series
    const withPosters = items.filter((i) => Boolean(i.poster_url && i.poster_url.trim()));
    if (withPosters.length > 0) return withPosters.slice(0, 10);

    return items.slice(0, 10);
  }, [items]);

  const total = candidates.length;

  // On first mount / when candidates become available:
  // If sessionCatalogBannerIndex is null (fresh app launch), choose a random banner.
  // If sessionCatalogBannerIndex was already set, keep it within valid range.
  useEffect(() => {
    if (total === 0) return;

    if (sessionCatalogBannerIndex === null) {
      const randomIndex = Math.floor(Math.random() * total);
      sessionCatalogBannerIndex = randomIndex;
      setCurrentIndex(randomIndex);
    } else {
      const safeIndex = sessionCatalogBannerIndex % total;
      if (safeIndex !== currentIndex) {
        setCurrentIndex(safeIndex);
      }
    }
  }, [total]);

  const updateBannerIndex = (newIdx: number) => {
    if (total === 0) return;
    const bounded = ((newIdx % total) + total) % total;
    sessionCatalogBannerIndex = bounded;
    setCurrentIndex(bounded);
  };

  const currentItem = candidates[currentIndex % Math.max(total, 1)] || null;

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (total <= 0) return;
    updateBannerIndex(currentIndex > 0 ? currentIndex - 1 : total - 1);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (total <= 0) return;
    updateBannerIndex(currentIndex + 1);
  };

  if (!currentItem) {
    return (
      <div
        className={`glass-card rounded-3xl p-6 border border-cardBorder text-center flex flex-col items-center justify-center min-h-[480px] max-h-[640px] aspect-[2/3] space-y-4 ${className}`}
      >
        <div className="w-16 h-16 rounded-2xl bg-accentViolet/20 text-accentViolet flex items-center justify-center">
          <Sparkles className="w-8 h-8 text-accentTeal" />
        </div>
        <div className="space-y-1.5 max-w-xs">
          <h3 className="text-base font-bold text-white">Рекомендации и планы</h3>
          <p className="text-xs text-gray-400">
            Добавьте фильмы со статусом «В планах», и они появятся в этом интерактивном баннере.
          </p>
        </div>
        {onAddItemClick && (
          <button
            onClick={onAddItemClick}
            className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-accentViolet to-accentTeal text-white text-xs font-bold shadow-lg hover:opacity-95 transition active:scale-95 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Добавить фильм</span>
          </button>
        )}
      </div>
    );
  }

  const posterSrc = getItemPoster(currentItem);
  const isPlanned = ['planned', 'в планах', 'у планах', 'отложено'].includes(
    (currentItem.status || '').toLowerCase().trim()
  );

  // Genre chips: split genres if comma separated
  const rawGenre = currentItem.genre || '';
  const genresList = rawGenre
    ? rawGenre
        .split(/[,/]+/)
        .map((g) => g.trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];

  const metaParts: string[] = [];
  const singleCategory = formatCategorySingle(currentItem.category, t);
  if (singleCategory) metaParts.push(singleCategory);
  if (currentItem.release_year) metaParts.push(currentItem.release_year);
  if (currentItem.director) metaParts.push(currentItem.director);
  if (currentItem.duration && currentItem.duration !== '-' && currentItem.duration !== '0') {
    metaParts.push(
      currentItem.duration.includes('мин')
        ? currentItem.duration
        : `${currentItem.duration} мин`
    );
  }

  return (
    <div
      onClick={() => onSelectItem(currentItem)}
      className={`featured-hero-banner relative w-full rounded-3xl overflow-hidden border border-cardBorder shadow-2xl group cursor-pointer select-none min-h-[480px] max-h-[640px] aspect-[2/3] flex flex-col justify-between ${className}`}
    >
      {/* Background Poster with smooth transition */}
      <img
        src={posterSrc}
        alt={currentItem.title}
        referrerPolicy="no-referrer"
        className="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-out"
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          if (!target.dataset.fallback) {
            target.dataset.fallback = 'true';
            target.src = getItemPoster({ id: currentItem.id, title: currentItem.title, poster_url: '' });
          }
        }}
      />

      {/* Cinematic Gradient Overlays: Rich dark scrims so text & controls pop across ALL themes */}
      <div className="absolute top-0 inset-x-0 bg-gradient-to-b from-black/85 via-black/35 to-transparent h-28 pointer-events-none" />
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent h-72 pointer-events-none" />

      {/* Top Bar: Clickable Badge & Navigation Arrows */}
      <div className="relative z-10 p-4 sm:p-5 flex items-center justify-between">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onBadgeClick?.();
          }}
          style={{ color: '#FFFFFF' }}
          className="featured-hero-badge inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/60 hover:bg-black/80 hover:border-accentTeal/50 backdrop-blur-md border border-white/20 text-white text-xs font-bold shadow-md cursor-pointer transition active:scale-95 group/badge"
          title="Показать все элементы этой категории"
        >
          {isPlanned ? (
            <>
              <BookmarkCheck className="w-3.5 h-3.5 text-accentTeal group-hover/badge:scale-110 transition-transform" />
              <span className="text-white font-semibold" style={{ color: '#FFFFFF' }}>В планах посмотреть</span>
            </>
          ) : (
            <>
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 group-hover/badge:scale-110 transition-transform" />
              <span className="text-white font-semibold" style={{ color: '#FFFFFF' }}>Рекомендуем сегодня</span>
            </>
          )}
        </button>

        {/* Carousel Arrows */}
        {total > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrev}
              style={{ color: '#FFFFFF' }}
              className="featured-hero-arrow w-8 h-8 rounded-full bg-black/60 hover:bg-black/90 backdrop-blur-md border border-white/20 text-white flex items-center justify-center transition active:scale-90 shadow-md"
              title="Предыдущий"
            >
              <ChevronLeft className="w-4 h-4 text-white" style={{ color: '#FFFFFF' }} />
            </button>
            <button
              type="button"
              onClick={handleNext}
              style={{ color: '#FFFFFF' }}
              className="featured-hero-arrow w-8 h-8 rounded-full bg-black/60 hover:bg-black/90 backdrop-blur-md border border-white/20 text-white flex items-center justify-center transition active:scale-90 shadow-md"
              title="Следующий"
            >
              <ChevronRight className="w-4 h-4 text-white" style={{ color: '#FFFFFF' }} />
            </button>
          </div>
        )}
      </div>

      {/* Bottom Content Area: Pushed right down next to actions button with compact spacing */}
      <div className="relative z-10 p-4 sm:p-5 space-y-2 mt-auto">
        {/* Title & Metadata */}
        <div className="space-y-0.5">
          <h2 className="text-xl sm:text-2xl font-black text-white leading-tight tracking-tight drop-shadow-md" style={{ color: '#FFFFFF' }}>
            {currentItem.title}
          </h2>
          {metaParts.length > 0 && (
            <p className="text-xs text-gray-200 font-medium line-clamp-1 drop-shadow" style={{ color: '#E2E8F0' }}>
              {metaParts.join(' • ')}
            </p>
          )}
        </div>

        {/* Genre Tags and Ratings IN ONE LINE */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {genresList.map((g, idx) => (
            <span
              key={idx}
              style={{ color: '#E2E8F0' }}
              className="px-2.5 py-0.5 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-semibold text-gray-200 border border-white/10"
            >
              {getTranslatedGenreShort(g, t)}
            </span>
          ))}

          {/* Public Rating (Kinopoisk / IMDb) */}
          {currentItem.public_rating && currentItem.public_rating.trim() !== '' && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/25 backdrop-blur-md border border-orange-500/35 text-orange-300 text-[11px] font-bold">
              <Popcorn className="w-3 h-3 text-orange-400" />
              <span>{currentItem.public_rating}</span>
            </div>
          )}

          {/* User's Rating (always shown if rating > 0) */}
          {currentItem.rating > 0 && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/25 backdrop-blur-md border border-amber-400/35 text-amber-300 text-[11px] font-bold">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span>{currentItem.rating}</span>
            </div>
          )}
        </div>

        {/* Actions Row */}
        <div className="flex items-center gap-2 pt-1">
          {/* Watch / Play Trailer Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onWatchTrailer(currentItem);
            }}
            style={{ color: '#FFFFFF' }}
            className="btn-watch-trailer flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-accentViolet via-purple-600 to-accentTeal hover:opacity-95 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xl shadow-accentViolet/30 transition active:scale-[0.98]"
          >
            <Play className="w-4 h-4 fill-white text-white" style={{ fill: '#FFFFFF', color: '#FFFFFF' }} />
            <span style={{ color: '#FFFFFF' }}>Смотреть трейлер</span>
          </button>

          {/* Plus / Details Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectItem(currentItem);
            }}
            style={{ color: '#FFFFFF' }}
            className="btn-details w-11 h-11 rounded-2xl bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/20 text-white flex items-center justify-center transition active:scale-95 shadow-md shrink-0"
            title="Подробнее"
          >
            <Plus className="w-5 h-5 stroke-[2.5] text-white" style={{ color: '#FFFFFF' }} />
          </button>
        </div>

        {/* Dots Indicator */}
        {total > 1 && (
          <div className="flex items-center justify-center gap-1.5 pt-2">
            {candidates.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  updateBannerIndex(idx);
                }}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === currentIndex
                    ? 'w-6 bg-accentTeal shadow-sm shadow-accentTeal/50'
                    : 'w-1.5 bg-white/30 hover:bg-white/50'
                }`}
                aria-label={`Слайд ${idx + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
