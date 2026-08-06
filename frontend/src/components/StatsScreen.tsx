import React, { useState } from 'react';
import { Star, Award, Film, Tv, Book, Gamepad2, TrendingUp, Clock, CheckCircle2, PlusCircle, Zap, BarChart3, Info } from 'lucide-react';
import { StatsData, UserProfile, Item } from '../types';
import { Translations } from '../services/i18n';
import { computeWatchHours, getLastNDays, countItemsPerSlot } from '../utils/watchTime';
import { InfoModal } from './InfoModal';

interface StatsScreenProps {
  stats?: StatsData | null;
  profile?: UserProfile | null;
  items?: Item[];
  t: Translations;
}

const CATEGORY_META: Record<string, { hex: string; label: string; icon: any }> = {
  Фильмы:  { hex: '#8C7CFF', label: 'Фильмы',  icon: Film },
  Сериалы: { hex: '#00CEC9', label: 'Сериалы', icon: Tv },
  Книги:   { hex: '#FFB800', label: 'Книги',   icon: Book },
  Игры:    { hex: '#00B894', label: 'Игры',    icon: Gamepad2 },
};

const normalizeCat = (catStr?: string): string => {
  const lc = (catStr || '').toLowerCase().trim();
  if (['movie', 'movies', 'фильмы', 'фильм'].includes(lc)) return 'Фильмы';
  if (['show', 'shows', 'series', 'сериалы', 'сериал'].includes(lc)) return 'Сериалы';
  if (['book', 'books', 'книги', 'книга'].includes(lc)) return 'Книги';
  if (['game', 'games', 'игры', 'игра'].includes(lc)) return 'Игры';
  return catStr || 'Фильмы';
};

const getCatTranslation = (cat: string, t: Translations) => {
  if (cat === 'Фильмы') return t.categories.movies;
  if (cat === 'Сериалы') return t.categories.shows;
  if (cat === 'Книги') return t.categories.books;
  if (cat === 'Игры') return t.categories.games;
  return cat;
};


export const StatsScreen: React.FC<StatsScreenProps> = ({ stats, profile, items = [], t }) => {
  const [activeTabKey, setActiveTabKey] = useState<'week' | 'month' | 'year' | 'all'>('week');
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);

  const periodTabs = [
    { key: 'week',  label: t.stats.tab_week },
    { key: 'month', label: t.stats.tab_month },
    { key: 'year',  label: t.stats.tab_year },
    { key: 'all',   label: t.stats.tab_all },
  ];

  const now = new Date();

  const filteredItems = items.filter((item) => {
    if (activeTabKey === 'all') return true;
    const dateStr = item.created_at || item.completed_at;
    if (!dateStr) return false;
    const diff = (now.getTime() - new Date(dateStr).getTime()) / (1000 * 3600 * 24);
    if (activeTabKey === 'week')  return diff <= 7;
    if (activeTabKey === 'month') return diff <= 30;
    return diff <= 365; // year
  });

  const totalPeriodItems = filteredItems.length;

  const completedItems = filteredItems.filter(
    (i) => ['completed', 'Просмотрено', 'Завершено'].includes(i.status || '')
  );
  const watchingItems = filteredItems.filter(
    (i) => ['watching', 'Смотрю', 'В процессе'].includes(i.status || '')
  );
  const plannedItems = filteredItems.filter(
    (i) => ['planned', 'Планирую'].includes(i.status || '')
  );

  const completedCount = completedItems.length;
  const completionRate = totalPeriodItems > 0 ? Math.round((completedCount / totalPeriodItems) * 100) : 0;

  // Books stats calculation
  const bookItems = filteredItems.filter((i) => normalizeCat(i.category) === 'Книги');
  const completedBooks = bookItems.filter((i) =>
    ['completed', 'Просмотрено', 'Завершено'].includes(i.status || '')
  );
  const readingBooks = bookItems.filter((i) =>
    ['watching', 'Смотрю', 'В процессе'].includes(i.status || '')
  );
  const plannedBooks = bookItems.filter((i) =>
    ['planned', 'Планирую'].includes(i.status || '')
  );
  const totalBookPages = completedBooks.reduce(
    (sum, i) => sum + (parseInt(i.duration || '0', 10) || 0),
    0
  );

  // Watch hours — computed from completed movies/shows only
  const displayHours = computeWatchHours(filteredItems);

  const renderWatchTime = (hours: number) => {
    if (hours < 24) {
      return (
        <>{hours}<span className="text-xs font-normal text-gray-400 ml-0.5">{t.stats.hours_short_unit || 'ч'}</span></>
      );
    }
    const days = hours / 24;
    if (days < 30.5) {
      const d = Math.floor(days);
      const h = hours % 24;
      return (
        <>
          {d}<span className="text-xs font-normal text-gray-400 ml-0.5 mr-1.5">{t.stats.days_short_unit || 'д'}</span>
          {h}<span className="text-xs font-normal text-gray-400 ml-0.5">{t.stats.hours_short_unit || 'ч'}</span>
        </>
      );
    }
    if (days < 365) {
      const m = Math.floor(days / 30.5);
      const remDays = Math.floor(days - m * 30.5);
      return (
        <>
          {m}<span className="text-xs font-normal text-gray-400 ml-0.5 mr-1.5">{t.stats.months_short_unit || 'м'}</span>
          {remDays}<span className="text-xs font-normal text-gray-400 ml-0.5">{t.stats.days_short_unit || 'д'}</span>
        </>
      );
    }
    const y = Math.floor(days / 365);
    const remDays = days - y * 365;
    const m = Math.floor(remDays / 30.5);
    return (
      <>
        {y}<span className="text-xs font-normal text-gray-400 ml-0.5 mr-1.5">{t.stats.years_short_unit || 'г'}</span>
        {m}<span className="text-xs font-normal text-gray-400 ml-0.5">{t.stats.months_short_unit || 'м'}</span>
      </>
    );
  };

  // Category breakdown (over filtered period)
  const categoryCounts: Record<string, number> = {};
  filteredItems.forEach((item) => {
    const cat = normalizeCat(item.category);
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });
  if (filteredItems.length === 0 && profile?.categories) {
    profile.categories.forEach((c) => {
      const cat = normalizeCat(c.category);
      categoryCounts[cat] = (categoryCounts[cat] || 0) + c.count;
    });
  }

  const grandTotal = Object.values(categoryCounts).reduce((a, b) => a + b, 0);
  const categorySegments = Object.entries(categoryCounts)
    .filter(([, count]) => count > 0)
    .map(([cat, count]) => ({
      cat,
      count,
      percent: grandTotal > 0 ? Math.round((count / grandTotal) * 100) : 0,
      meta: CATEGORY_META[cat] || { hex: '#8C7CFF', label: cat, icon: Film },
    }))
    .sort((a, b) => b.count - a.count);

  // Donut
  let arcOffset = 0;
  const circumference = 2 * Math.PI * 15.9155;

  // Ratings
  const ratedItems = items.filter((i) => i.rating && i.rating > 0);
  const avgRating = ratedItems.length > 0
    ? (ratedItems.reduce((acc, i) => acc + i.rating, 0) / ratedItems.length).toFixed(1)
    : '—';

  // Bar chart data — rolling window, "today" always on the right
  const getBarData = (): { labels: string[]; counts: number[] } => {
    if (activeTabKey === 'week') {
      // Last 7 days rolling, today is rightmost
      const slots = getLastNDays(7);
      const labels = slots.map(d => t.stats.short_days[d.getDay()]);
      const counts = countItemsPerSlot(items, slots); // use all items to cover exact days
      return { labels, counts };
    }

    if (activeTabKey === 'month') {
      return {
        labels: ['1–7', '8–14', '15–21', '22–31'],
        counts: filteredItems.reduce((acc, i) => {
          const d = new Date(i.created_at || i.completed_at || Date.now()).getDate();
          if (d <= 7) acc[0]++; else if (d <= 14) acc[1]++; else if (d <= 21) acc[2]++; else acc[3]++;
          return acc;
        }, [0, 0, 0, 0] as number[]),
      };
    }

    // Year or All — last 6 months rolling
    const counts = new Array(6).fill(0);
    const slots = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return d;
    });
    const labels = slots.map(d => {
      const months = t.stats.short_months;
      return months[d.getMonth()];
    });
    filteredItems.forEach((item) => {
      const dateStr = item.created_at || item.completed_at;
      if (!dateStr) return;
      const itemDate = new Date(dateStr);
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const nextSlot = slots[i + 1] ?? new Date(now.getFullYear(), now.getMonth() + 1, 1);
        if (itemDate >= slot && itemDate < nextSlot) {
          counts[i]++;
          break;
        }
      }
    });
    return { labels, counts };
  };

  const { labels: barLabels, counts: barCounts } = getBarData();
  const maxBar = Math.max(...barCounts, 1);
  const hasBarData = barCounts.some((v) => v > 0);

  return (
    <>
      <InfoModal
        isOpen={isInfoModalOpen}
        message={t.stats.hours_info_message}
        onClose={() => setIsInfoModalOpen(false)}
        t={t}
      />
      <div className="space-y-4 animate-slide-up pb-10">
      <h1 className="text-base font-bold text-center text-white">{t.stats.title}</h1>

      {/* Period Tabs */}
      <div className="grid grid-cols-4 gap-1 p-1 glass-card rounded-2xl text-xs text-center">
        {periodTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTabKey(tab.key as any)}
            className={`py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTabKey === tab.key
                ? 'bg-accentViolet text-white shadow-md shadow-accentViolet/30'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="glass-card p-3 rounded-2xl border border-cardBorder flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <PlusCircle className="w-3 h-3 shrink-0" style={{ color: '#8C7CFF' }} />
            <span className="text-[10px] text-gray-400 truncate">{t.stats.card_added}</span>
          </div>
          <div className="text-xl font-extrabold text-accentViolet leading-none">{totalPeriodItems}</div>
          <div className="text-[9px] text-gray-400">{t.stats.out_of_total.replace('{count}', items.length.toString())}</div>
        </div>

        <div className="glass-card p-3 rounded-2xl border border-cardBorder flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 shrink-0" style={{ color: '#60A5FA' }} />
            <span className="text-[10px] text-gray-400 truncate">{t.stats.card_spent}</span>
            <button onClick={() => setIsInfoModalOpen(true)} className="ml-auto shrink-0 text-gray-400 hover:text-accentViolet transition-colors active:scale-[0.97]">
              <Info className="w-2.5 h-2.5" />
            </button>
          </div>
          <div className="text-xl font-extrabold text-blue-400 leading-none whitespace-nowrap">
            {renderWatchTime(displayHours)}
          </div>
          <div className="text-[9px] text-gray-400">{t.stats.movies_and_shows}</div>
        </div>

        <div className="glass-card p-3 rounded-2xl border border-cardBorder flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 shrink-0" style={{ color: '#00CEC9' }} />
            <span className="text-[10px] text-gray-400 truncate">{t.stats.card_completed}</span>
          </div>
          <div className="text-xl font-extrabold text-accentTeal leading-none">{completedCount}</div>
          <div className="text-[9px] text-accentTeal font-semibold">{t.stats.percent_completed.replace('%', completionRate + '%')}</div>
        </div>
      </div>

      {/* Status breakdown bars */}
      {totalPeriodItems > 0 && (
        <div className="glass-card p-4 rounded-2xl border border-cardBorder space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-accentViolet" />
              {t.stats.statuses}
            </span>
            <span className="text-[10px] text-gray-400">{totalPeriodItems} {t.stats.records_count}</span>
          </div>
          {[
            { label: t.modal.status_completed,     count: completedCount,       color: '#00CEC9', pct: completionRate },
            { label: t.modal.status_watching,   count: watchingItems.length,  color: '#8C7CFF', pct: totalPeriodItems > 0 ? Math.round(watchingItems.length / totalPeriodItems * 100) : 0 },
            { label: t.modal.status_planned, count: plannedItems.length,   color: '#FFB800', pct: totalPeriodItems > 0 ? Math.round(plannedItems.length / totalPeriodItems * 100) : 0 },
          ].map(({ label, count, color, pct }) => (
            <div key={label} className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-gray-300">{label}</span>
                <span className="font-bold text-white">{count} <span className="text-gray-400 font-normal">({pct}%)</span></span>
              </div>
              <div className="h-1.5 rounded-full bg-cardBorder/40 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Activity Bar Chart — rolling last-N-days, today always rightmost */}
      <div className="glass-card p-4 rounded-2xl border border-cardBorder space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-accentViolet" />
              {t.stats.activity_title}
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">{t.stats.activity_chart_subtitle}</div>
          </div>
          <div className="text-[10px] font-bold text-accentViolet bg-accentViolet/10 px-2.5 py-1 rounded-full">
            {totalPeriodItems} {t.stats.records_count}
          </div>
        </div>

        <div className="flex items-end gap-1.5 h-24 mt-2">
          {barCounts.map((count, idx) => {
            const isToday = activeTabKey === 'week' && idx === barCounts.length - 1;
            const isPeak = hasBarData && count === maxBar && count > 0;
            const heightPct = hasBarData && count > 0 ? Math.max((count / maxBar) * 90, 12) : 0;
            return (
              <div key={idx} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                {count > 0 && (
                  <span
                    className="text-[9px] font-bold leading-none shrink-0"
                    style={{ color: isPeak || isToday ? '#00CEC9' : '#8C7CFF' }}
                  >
                    {count}
                  </span>
                )}
                {count > 0 ? (
                  <div
                    className="w-full rounded-t-lg transition-all duration-500"
                    style={{
                      height: `${heightPct}%`,
                      background: isPeak || isToday
                        ? 'linear-gradient(to top, #00CEC9, #81ECE8)'
                        : 'linear-gradient(to top, rgba(140,124,255,0.5), #8C7CFF)',
                      boxShadow: isPeak || isToday ? '0 0 10px rgba(0,206,201,0.25)' : undefined,
                    }}
                  />
                ) : (
                  <div className="w-full h-0.5 rounded-full bg-cardBorder/30" />
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-between pt-1 border-t border-cardBorder/30">
          {barLabels.map((lbl, i) => {
            const isToday = activeTabKey === 'week' && i === barLabels.length - 1;
            return (
              <span
                key={i}
                className={`flex-1 text-center text-[9px] font-medium ${isToday ? 'text-accentTeal' : 'text-gray-400'}`}
              >
                {lbl}{isToday ? ' ·' : ''}
              </span>
            );
          })}
        </div>
      </div>

      {/* Dedicated Books & Reading Stats Card */}
      <div className="glass-card p-4 rounded-2xl border border-cardBorder space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white flex items-center gap-1.5">
            <Book className="w-3.5 h-3.5 text-amber-400" />
            {t.stats.books_stats_title || 'Книги и чтение'}
          </span>
          <span className="text-[10px] text-gray-400 font-medium">
            {bookItems.length} {t.stats.records_count}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white/5 p-2.5 rounded-xl border border-white/5 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-400 truncate">{t.stats.books_read || 'Прочитано'}</span>
              <CheckCircle2 className="w-3 h-3 text-amber-400" />
            </div>
            <div className="text-lg font-extrabold text-amber-400 leading-none">{completedBooks.length}</div>
            <div className="text-[9px] text-gray-400">{t.stats.out_of_total.replace('{count}', bookItems.length.toString())}</div>
          </div>

          <div className="bg-white/5 p-2.5 rounded-xl border border-white/5 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-400 truncate">{t.stats.books_reading || 'Читаю'}</span>
              <Book className="w-3 h-3 text-accentViolet" />
            </div>
            <div className="text-lg font-extrabold text-accentViolet leading-none">{readingBooks.length}</div>
            <div className="text-[9px] text-gray-400">{t.stats.active_records}</div>
          </div>

          <div className="bg-white/5 p-2.5 rounded-xl border border-white/5 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-400 truncate">{t.stats.books_planned || 'В планах'}</span>
              <Clock className="w-3 h-3 text-accentTeal" />
            </div>
            <div className="text-lg font-extrabold text-accentTeal leading-none">{plannedBooks.length}</div>
            <div className="text-[9px] text-gray-400">{t.modal.status_planned}</div>
          </div>
        </div>

        {totalBookPages > 0 && (
          <div className="pt-2 border-t border-cardBorder/30 flex items-center justify-between text-xs">
            <span className="text-gray-400 text-[10px]">{t.stats.pages_read_approx || 'Прочитано страниц'}:</span>
            <span className="font-bold text-amber-400 text-xs">~{totalBookPages} {t.details.pages_unit || 'стр.'}</span>
          </div>
        )}
      </div>

      {/* Category Distribution */}
      {grandTotal > 0 && (
        <div className="glass-card p-4 rounded-2xl border border-cardBorder space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white">{t.stats.categories_title}</span>
            <span className="text-[10px] text-gray-400">{grandTotal} {t.stats.total_suffix}</span>
          </div>

          <div className="flex items-center gap-5">
            {/* Donut */}
            <div className="relative shrink-0 w-24 h-24">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.9155" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3.5" />
                {(() => {
                  arcOffset = 0;
                  return categorySegments.map((seg, idx) => {
                    const len = (seg.percent / 100) * circumference;
                    const dashArray = `${len} ${circumference - len}`;
                    const dashOffset = -arcOffset;
                    arcOffset += len;
                    return (
                      <circle
                        key={idx}
                        cx="18" cy="18" r="15.9155"
                        fill="none"
                        stroke={seg.meta.hex}
                        strokeWidth="4"
                        strokeDasharray={dashArray}
                        strokeDashoffset={dashOffset}
                        strokeLinecap="butt"
                      />
                    );
                  });
                })()}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-extrabold text-white leading-none">{grandTotal}</span>
                <span className="text-[9px] text-gray-400">{t.stats.records_count}</span>
              </div>
            </div>

            {/* Top 3 legend */}
            <div className="flex-1 space-y-2.5">
              {categorySegments.slice(0, 3).map((seg) => {
                const Icon = seg.meta.icon;
                return (
                  <div key={seg.cat} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: seg.meta.hex }} />
                    <Icon style={{ color: seg.meta.hex }} className="w-3 h-3 shrink-0" />
                    <span className="text-xs font-semibold text-gray-200 flex-1 truncate">{getCatTranslation(seg.cat, t)}</span>
                    <span className="text-xs font-bold text-white">{seg.count}</span>
                    <span className="text-[10px] text-gray-400 w-8 text-right">{seg.percent}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Horizontal progress bars — NO gray boxes */}
          <div className="space-y-2.5 pt-2 border-t border-cardBorder/40">
            {categorySegments.map((seg) => {
              const Icon = seg.meta.icon;
              return (
                <div key={seg.cat} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <Icon style={{ color: seg.meta.hex }} className="w-3.5 h-3.5" />
                      <span className="font-medium text-gray-300">{getCatTranslation(seg.cat, t)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-white">{seg.count}</span>
                      <span className="text-[10px] font-semibold" style={{ color: seg.meta.hex }}>{seg.percent}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-cardBorder/30 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${seg.percent}%`, background: seg.meta.hex }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Insight Cards */}
      <div className="grid grid-cols-2 gap-2">
        <div className="glass-card p-3.5 rounded-2xl border border-cardBorder space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-accentViolet">
            <Award className="w-3.5 h-3.5" />
            {t.stats.top_category}
          </div>
          {categorySegments[0] ? (
            <>
              <div className="text-sm font-extrabold text-white">{getCatTranslation(categorySegments[0].cat, t)}</div>
              <div className="text-[10px] text-gray-400">{categorySegments[0].count} {t.stats.records_count} · {categorySegments[0].percent}%</div>
            </>
          ) : <div className="text-xs text-gray-500">—</div>}
        </div>

        <div className="glass-card p-3.5 rounded-2xl border border-cardBorder space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-400">
            <Star className="w-3.5 h-3.5 fill-amber-400" />
            {t.stats.avg_rating}
          </div>
          <div className="text-sm font-extrabold text-white">
            {avgRating}{avgRating !== '—' && <span className="text-xs font-normal text-gray-400 ml-1">/ 10</span>}
          </div>
          <div className="text-[10px] text-gray-400">{ratedItems.length > 0 ? `${ratedItems.length} ${t.stats.rated_count}` : t.stats.no_ratings}</div>
        </div>

        <div className="glass-card p-3.5 rounded-2xl border border-cardBorder space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-accentTeal">
            <TrendingUp className="w-3.5 h-3.5" />
            {t.stats.add_rate}
          </div>
          <div className="text-sm font-extrabold text-white">
            {activeTabKey === 'week'
              ? `${totalPeriodItems}${t.stats.per_week}`
              : activeTabKey === 'month'
              ? `${(totalPeriodItems / 4).toFixed(1)}${t.stats.per_week}`
              : `${(totalPeriodItems / 52).toFixed(1)}${t.stats.per_week}`
            }
          </div>
          <div className="text-[10px] text-gray-400">{t.stats.on_average}</div>
        </div>

        <div className="glass-card p-3.5 rounded-2xl border border-cardBorder space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-400">
            <Clock className="w-3.5 h-3.5" />
            {t.stats.watching_now}
          </div>
          <div className="text-sm font-extrabold text-white">{watchingItems.length}</div>
          <div className="text-[10px] text-gray-400">{t.stats.active_records}</div>
        </div>
      </div>
    </div>
    </>
  );
};
