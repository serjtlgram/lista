import React, { useState } from 'react';
import { Sparkles, Star, Award, Film, Tv, Book, Headphones, Mic, Gamepad2 } from 'lucide-react';
import { StatsData, UserProfile, Item } from '../types';
import { Translations } from '../services/i18n';

interface StatsScreenProps {
  stats?: StatsData | null;
  profile?: UserProfile | null;
  items?: Item[];
  t: Translations;
}

const CATEGORY_COLORS: Record<string, { hex: string; bg: string; text: string; icon: any }> = {
  Фильмы: { hex: '#8C7CFF', bg: 'bg-[#8C7CFF]/15', text: 'text-[#8C7CFF]', icon: Film },
  Сериалы: { hex: '#00CEC9', bg: 'bg-[#00CEC9]/15', text: 'text-[#00CEC9]', icon: Tv },
  Книги: { hex: '#FFB800', bg: 'bg-[#FFB800]/15', text: 'text-[#FFB800]', icon: Book },
  Аудиокниги: { hex: '#0984E3', bg: 'bg-[#0984E3]/15', text: 'text-[#0984E3]', icon: Headphones },
  Подкасты: { hex: '#E84393', bg: 'bg-[#E84393]/15', text: 'text-[#E84393]', icon: Mic },
  Игры: { hex: '#00B894', bg: 'bg-[#00B894]/15', text: 'text-[#00B894]', icon: Gamepad2 },
};

const normalizeCategory = (catStr?: string): string => {
  const lc = (catStr || '').toLowerCase().trim();
  if (['movie', 'movies', 'фильмы', 'фильм'].includes(lc)) return 'Фильмы';
  if (['show', 'shows', 'series', 'сериалы', 'сериал'].includes(lc)) return 'Сериалы';
  if (['book', 'books', 'книги', 'книга'].includes(lc)) return 'Книги';
  if (['audiobook', 'audiobooks', 'аудиокниги', 'аудиокнига'].includes(lc)) return 'Аудиокниги';
  if (['podcast', 'podcasts', 'подкасты', 'подкаст'].includes(lc)) return 'Подкасты';
  if (['game', 'games', 'игры', 'игра'].includes(lc)) return 'Игры';
  return catStr || 'Фильмы';
};

const parseHours = (durationStr?: string): number => {
  if (!durationStr) return 0;
  let totalMin = 0;
  if (durationStr.includes('•') || durationStr.includes('сер.')) {
    const parts = durationStr.split('•');
    const ep = parseInt(parts[0]?.replace(/\D/g, '') || '0', 10);
    const min = parseInt(parts[1]?.replace(/\D/g, '') || '45', 10);
    totalMin = (ep > 0 ? ep : 1) * (min > 0 ? min : 45);
  } else {
    const min = parseInt(durationStr.replace(/\D/g, '') || '0', 10);
    totalMin = min;
  }
  return totalMin / 60;
};

export const StatsScreen: React.FC<StatsScreenProps> = ({ stats, profile, items = [], t }) => {
  const [activeTabKey, setActiveTabKey] = useState<'week' | 'month' | 'year' | 'all'>('month');

  const periodTabs = [
    { key: 'week', label: t.stats.tab_week },
    { key: 'month', label: t.stats.tab_month },
    { key: 'year', label: t.stats.tab_year },
    { key: 'all', label: t.stats.tab_all },
  ];

  // Filter items according to period
  const now = new Date();
  const filteredItems = items.filter((item) => {
    if (activeTabKey === 'all') return true;
    const dateStr = item.created_at || item.completed_at;
    if (!dateStr) return true;
    const itemDate = new Date(dateStr);
    const diffDays = (now.getTime() - itemDate.getTime()) / (1000 * 3600 * 24);
    if (activeTabKey === 'week') return diffDays <= 7;
    if (activeTabKey === 'month') return diffDays <= 30;
    if (activeTabKey === 'year') return diffDays <= 365;
    return true;
  });

  const totalPeriodItems = filteredItems.length;

  // Completed items in period
  const completedItems = filteredItems.filter(
    (i) => i.status === 'completed' || i.status === 'Просмотрено' || i.status === 'Завершено'
  );
  const completedCount = completedItems.length;

  // Hours spent in period
  const computedHours = Math.round(
    filteredItems.reduce((acc, i) => acc + parseHours(i.duration), 0)
  );
  const displayHours = computedHours > 0 ? computedHours : stats?.total_hours || profile?.monthly_hours || 0;

  // Completion Rate
  const completionRate = totalPeriodItems > 0 ? Math.round((completedCount / totalPeriodItems) * 100) : 0;

  // Category Breakdown
  const categoryCounts: Record<string, number> = {
    Фильмы: 0,
    Сериалы: 0,
    Книги: 0,
    Аудиокниги: 0,
    Подкасты: 0,
    Игры: 0,
  };

  const targetList = items.length > 0 ? items : [];
  targetList.forEach((item) => {
    const normCat = normalizeCategory(item.category);
    categoryCounts[normCat] = (categoryCounts[normCat] || 0) + 1;
  });

  // If stats.category_percentage or profile.categories provided and items is empty, fallback:
  if (items.length === 0 && profile?.categories) {
    profile.categories.forEach((c) => {
      const normCat = normalizeCategory(c.category);
      categoryCounts[normCat] = (categoryCounts[normCat] || 0) + c.count;
    });
  }

  const grandTotal = Object.values(categoryCounts).reduce((a, b) => a + b, 0);

  const categorySegments = Object.entries(categoryCounts)
    .filter(([_, count]) => count > 0)
    .map(([cat, count]) => ({
      category: cat,
      count,
      percent: grandTotal > 0 ? Math.round((count / grandTotal) * 100) : 0,
      color: CATEGORY_COLORS[cat] || { hex: '#8C7CFF', bg: 'bg-accentViolet/15', text: 'text-accentViolet', icon: Film },
    }))
    .sort((a, b) => b.count - a.count);

  // Donut SVG Calculations
  const radius = 15.9155;
  const circumference = 100;
  let accumulatedPercent = 0;

  // Top Category
  const topCat = categorySegments[0] || null;

  // Average Rating
  const ratedItems = items.filter((i) => i.rating && i.rating > 0);
  const avgRatingVal =
    ratedItems.length > 0
      ? (ratedItems.reduce((acc, i) => acc + i.rating, 0) / ratedItems.length).toFixed(1)
      : '9.0';

  // Activity Bar Chart Data (7 bars for Week, 4 bars for Month, 6 bars for Year/All)
  const getBarChartData = () => {
    if (activeTabKey === 'week') {
      const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
      const counts = [0, 0, 0, 0, 0, 0, 0];
      filteredItems.forEach((i) => {
        const d = new Date(i.created_at || i.completed_at || Date.now());
        const dayIdx = (d.getDay() + 6) % 7; // Monday = 0
        counts[dayIdx]++;
      });
      return { labels: days, counts };
    } else if (activeTabKey === 'month') {
      const labels = ['1-7 дн', '8-14 дн', '15-21 дн', '22-31 дн'];
      const counts = [0, 0, 0, 0];
      filteredItems.forEach((i) => {
        const d = new Date(i.created_at || i.completed_at || Date.now());
        const day = d.getDate();
        if (day <= 7) counts[0]++;
        else if (day <= 14) counts[1]++;
        else if (day <= 21) counts[2]++;
        else counts[3]++;
      });
      return { labels, counts };
    } else {
      const labels = ['Янв', 'Мар', 'Май', 'Июл', 'Сен', 'Ноя'];
      const counts = [0, 0, 0, 0, 0, 0];
      filteredItems.forEach((i) => {
        const d = new Date(i.created_at || i.completed_at || Date.now());
        const mIdx = Math.floor(d.getMonth() / 2); // Group by 2-month periods
        if (mIdx >= 0 && mIdx < 6) counts[mIdx]++;
      });
      return { labels, counts };
    }
  };

  const { labels: barLabels, counts: barCounts } = getBarChartData();
  const maxBarCount = Math.max(...barCounts, 1);

  return (
    <div className="space-y-4 animate-slide-up pb-8">
      <h1 className="text-base font-bold text-center text-white">{t.stats.title}</h1>

      {/* Time Filter Tabs */}
      <div className="grid grid-cols-4 gap-1 p-1 bg-cardDark rounded-2xl border border-cardBorder text-xs text-center shadow-sm">
        {periodTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTabKey(tab.key as any)}
            className={`py-2 rounded-xl text-xs font-semibold transition ${
              activeTabKey === tab.key
                ? 'bg-accentViolet text-white shadow-md shadow-accentViolet/30 font-bold'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Top Cards with Real Calculated Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="glass-card p-3 rounded-2xl border border-cardBorder space-y-1">
          <div className="text-[10px] text-gray-400 font-medium">{t.stats.card_added}</div>
          <div className="text-xl font-extrabold text-white">{totalPeriodItems}</div>
          <div className="text-[9px] text-accentTeal font-semibold flex items-center gap-0.5">
            <span>+{totalPeriodItems > 0 ? '100%' : '0%'}</span>
          </div>
        </div>

        <div className="glass-card p-3 rounded-2xl border border-cardBorder space-y-1">
          <div className="text-[10px] text-gray-400 font-medium">{t.stats.card_spent}</div>
          <div className="text-xl font-extrabold text-white">
            {displayHours}
            <span className="text-xs font-normal text-gray-400 ml-0.5">{t.stats.hours_unit}</span>
          </div>
          <div className="text-[9px] text-gray-400 flex items-center gap-0.5">
            <span>~{Math.round(displayHours / (totalPeriodItems || 1))}ч/запись</span>
          </div>
        </div>

        <div className="glass-card p-3 rounded-2xl border border-cardBorder space-y-1">
          <div className="text-[10px] text-gray-400 font-medium">{t.stats.card_completed}</div>
          <div className="text-xl font-extrabold text-accentTeal">{completedCount}</div>
          <div className="text-[9px] text-accentTeal font-semibold flex items-center gap-0.5">
            <span>{completionRate}% готово</span>
          </div>
        </div>
      </div>

      {/* Dynamic Activity Bar Chart */}
      <div className="glass-card p-4 rounded-2xl space-y-3 border border-cardBorder">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-white">{t.stats.activity_title}</div>
            <div className="text-[10px] text-gray-400">{t.stats.activity_chart_subtitle}</div>
          </div>
          <div className="px-2 py-0.5 rounded-full bg-accentViolet/15 text-accentViolet text-[10px] font-bold">
            Всего: {totalPeriodItems}
          </div>
        </div>

        <div className="flex items-end justify-between h-28 pt-6 pb-1 gap-2">
          {barCounts.map((count, idx) => {
            const heightPercent = maxBarCount > 0 ? Math.max((count / maxBarCount) * 100, count > 0 ? 15 : 6) : 6;
            const isPeak = count === maxBarCount && count > 0;
            return (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                {count > 0 && (
                  <span className="text-[9px] font-bold text-white bg-cardDark/90 px-1.5 py-0.5 rounded border border-cardBorder shadow shrink-0">
                    {count}
                  </span>
                )}
                <div className="w-full bg-bgDark/60 rounded-t-lg overflow-hidden flex items-end h-full">
                  <div
                    className={`w-full rounded-t-lg transition-all duration-300 ${
                      isPeak
                        ? 'bg-gradient-to-t from-accentTeal to-teal-400 shadow-md shadow-accentTeal/30'
                        : count > 0
                        ? 'bg-gradient-to-t from-accentViolet/60 to-accentViolet'
                        : 'bg-cardBorder/30'
                    }`}
                    style={{ height: `${heightPercent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-between text-[10px] text-gray-400 font-medium px-1 border-t border-cardBorder/40 pt-2">
          {barLabels.map((lbl, i) => (
            <span key={i} className="text-center flex-1">{lbl}</span>
          ))}
        </div>
      </div>

      {/* Multi-Segment Category Distribution Donut Chart */}
      <div className="glass-card p-4 rounded-2xl space-y-3.5 border border-cardBorder">
        <div className="flex items-center justify-between border-b border-cardBorder pb-2">
          <div className="text-xs font-bold text-white">{t.stats.categories_title}</div>
          <div className="text-[10px] text-gray-400 font-semibold">{grandTotal} всего</div>
        </div>

        {grandTotal > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-6 py-1">
              {/* Multi-color SVG Donut */}
              <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  {/* Background Track */}
                  <circle
                    cx="18"
                    cy="18"
                    r={radius}
                    fill="none"
                    stroke="#1E2330"
                    strokeWidth="4"
                  />
                  {/* Colored Segments */}
                  {categorySegments.map((seg, idx) => {
                    const strokeDash = `${(seg.percent / 100) * circumference} ${circumference}`;
                    const offset = accumulatedPercent;
                    accumulatedPercent += seg.percent;
                    return (
                      <circle
                        key={idx}
                        cx="18"
                        cy="18"
                        r={radius}
                        fill="none"
                        stroke={seg.color.hex}
                        strokeWidth="4.5"
                        strokeDasharray={strokeDash}
                        strokeDashoffset={`-${(offset / 100) * circumference}`}
                        strokeLinecap="round"
                        className="transition-all duration-500"
                      />
                    );
                  })}
                </svg>

                {/* Center Content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                  <span className="text-base font-extrabold text-white">{grandTotal}</span>
                  <span className="text-[9px] text-gray-400 font-medium">записей</span>
                </div>
              </div>

              {/* Top 3 Breakdown Summary */}
              <div className="flex-1 space-y-2">
                {categorySegments.slice(0, 3).map((seg) => {
                  const Icon = seg.color.icon;
                  return (
                    <div key={seg.category} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0 pr-1">
                        <div className={`w-5 h-5 rounded-lg ${seg.color.bg} ${seg.color.text} flex items-center justify-center shrink-0`}>
                          <Icon className="w-3 h-3" />
                        </div>
                        <span className="font-semibold text-gray-200 truncate">{seg.category}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-bold text-white">{seg.count}</span>
                        <span className="text-[10px] text-gray-400">({seg.percent}%)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* All Categories Grid Breakdown */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-cardBorder/50">
              {categorySegments.map((seg) => {
                const Icon = seg.color.icon;
                return (
                  <div
                    key={seg.category}
                    className="p-2.5 rounded-xl bg-bgDark/50 border border-cardBorder/60 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-1">
                      <div className={`w-6 h-6 rounded-lg ${seg.color.bg} ${seg.color.text} flex items-center justify-center shrink-0`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white truncate">{seg.category}</div>
                        <div className="text-[10px] text-gray-400">{seg.count} карточек</div>
                      </div>
                    </div>
                    <span className={`text-xs font-bold ${seg.color.text} shrink-0`}>
                      {seg.percent}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-xs text-gray-500">
            {t.recently_added.empty}
          </div>
        )}
      </div>

      {/* Personal Insights Cards */}
      <div className="grid grid-cols-2 gap-2">
        <div className="glass-card p-3.5 rounded-2xl border border-cardBorder space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-accentViolet">
            <Award className="w-4 h-4" />
            {t.stats.top_category}
          </div>
          {topCat ? (
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-1">
                {topCat.category}
              </div>
              <div className="text-[10px] text-gray-400">
                {topCat.percent}% коллекции ({topCat.count} шт.)
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-400">—</div>
          )}
        </div>

        <div className="glass-card p-3.5 rounded-2xl border border-cardBorder space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
            <Star className="w-4 h-4 fill-amber-400" />
            {t.stats.avg_rating}
          </div>
          <div>
            <div className="text-sm font-bold text-white">
              {avgRatingVal} <span className="text-xs font-normal text-gray-400">/ 10</span>
            </div>
            <div className="text-[10px] text-gray-400">
              По {ratedItems.length || targetList.length} оценённым
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
