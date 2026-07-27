import React, { useState } from 'react';
import { Star, Award, Film, Tv, Book, Headphones, Mic, Gamepad2, TrendingUp, Clock, CheckCircle2, PlusCircle, Zap, BarChart3 } from 'lucide-react';
import { StatsData, UserProfile, Item } from '../types';
import { Translations } from '../services/i18n';

interface StatsScreenProps {
  stats?: StatsData | null;
  profile?: UserProfile | null;
  items?: Item[];
  t: Translations;
}

const CATEGORY_META: Record<string, { hex: string; light: string; label: string; icon: any }> = {
  Фильмы:     { hex: '#8C7CFF', light: 'rgba(140,124,255,0.15)', label: 'Фильмы',     icon: Film },
  Сериалы:    { hex: '#00CEC9', light: 'rgba(0,206,201,0.15)',   label: 'Сериалы',    icon: Tv },
  Книги:      { hex: '#FFB800', light: 'rgba(255,184,0,0.15)',   label: 'Книги',      icon: Book },
  Аудиокниги: { hex: '#0984E3', light: 'rgba(9,132,227,0.15)',   label: 'Аудиокниги', icon: Headphones },
  Подкасты:   { hex: '#E84393', light: 'rgba(232,67,147,0.15)',  label: 'Подкасты',   icon: Mic },
  Игры:       { hex: '#00B894', light: 'rgba(0,184,148,0.15)',   label: 'Игры',       icon: Gamepad2 },
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
  if (durationStr.includes('•') || durationStr.includes('сер.')) {
    const parts = durationStr.split('•');
    const ep = parseInt(parts[0]?.replace(/\D/g, '') || '0', 10);
    const min = parseInt(parts[1]?.replace(/\D/g, '') || '45', 10);
    return ((ep > 0 ? ep : 1) * (min > 0 ? min : 45)) / 60;
  }
  const min = parseInt(durationStr.replace(/\D/g, '') || '0', 10);
  return min / 60;
};

export const StatsScreen: React.FC<StatsScreenProps> = ({ stats, profile, items = [], t }) => {
  const [activeTabKey, setActiveTabKey] = useState<'week' | 'month' | 'year' | 'all'>('month');

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
    if (activeTabKey === 'year')  return diff <= 365;
    return true;
  });

  const totalPeriodItems = filteredItems.length;

  const completedItems = filteredItems.filter(
    (i) => i.status === 'completed' || i.status === 'Просмотрено' || i.status === 'Завершено'
  );

  const watchingItems = filteredItems.filter(
    (i) => i.status === 'watching' || i.status === 'Смотрю' || i.status === 'В процессе'
  );

  const plannedItems = filteredItems.filter(
    (i) => i.status === 'planned' || i.status === 'Планирую'
  );

  const completedCount = completedItems.length;
  const completionRate = totalPeriodItems > 0 ? Math.round((completedCount / totalPeriodItems) * 100) : 0;

  const computedHours = Math.round(filteredItems.reduce((acc, i) => acc + parseHours(i.duration), 0));
  const displayHours = computedHours > 0 ? computedHours : (activeTabKey === 'month' ? stats?.total_hours || profile?.monthly_hours || 0 : stats?.total_hours || 0);

  // Category breakdown (always over all items for donut to be meaningful)
  const categoryCounts: Record<string, number> = {};
  const baseList = activeTabKey === 'all' ? items : filteredItems;
  baseList.forEach((item) => {
    const cat = normalizeCategory(item.category);
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });
  if (baseList.length === 0 && profile?.categories) {
    profile.categories.forEach((c) => {
      const cat = normalizeCategory(c.category);
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
      meta: CATEGORY_META[cat] || { hex: '#8C7CFF', light: 'rgba(140,124,255,0.15)', label: cat, icon: Film },
    }))
    .sort((a, b) => b.count - a.count);

  // Donut arc calc
  let arcOffset = 0;
  const circumference = 2 * Math.PI * 15.9155;

  // Ratings
  const ratedItems = items.filter((i) => i.rating && i.rating > 0);
  const avgRating = ratedItems.length > 0
    ? (ratedItems.reduce((acc, i) => acc + i.rating, 0) / ratedItems.length).toFixed(1)
    : '—';

  // Activity bar data — only show real bars, no background fill for zero
  const getBarData = () => {
    if (activeTabKey === 'week') {
      const labels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
      const counts = [0, 0, 0, 0, 0, 0, 0];
      filteredItems.forEach((i) => {
        const d = new Date(i.created_at || i.completed_at || Date.now());
        counts[(d.getDay() + 6) % 7]++;
      });
      return { labels, counts };
    } else if (activeTabKey === 'month') {
      return {
        labels: ['1–7', '8–14', '15–21', '22–31'],
        counts: filteredItems.reduce((acc, i) => {
          const d = new Date(i.created_at || i.completed_at || Date.now()).getDate();
          if (d <= 7) acc[0]++; else if (d <= 14) acc[1]++; else if (d <= 21) acc[2]++; else acc[3]++;
          return acc;
        }, [0, 0, 0, 0]),
      };
    } else {
      const labels = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
      const counts = new Array(12).fill(0);
      filteredItems.forEach((i) => {
        const m = new Date(i.created_at || i.completed_at || Date.now()).getMonth();
        counts[m]++;
      });
      // Show only last 6 months for readability
      const last6 = labels.slice(6);
      const last6counts = counts.slice(6);
      return { labels: last6, counts: last6counts };
    }
  };

  const { labels: barLabels, counts: barCounts } = getBarData();
  const maxBar = Math.max(...barCounts, 1);
  const hasBarData = barCounts.some((v) => v > 0);

  return (
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

      {/* KPI Row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: PlusCircle, label: t.stats.card_added,     value: totalPeriodItems, sub: `из ${items.length} всего`,  color: 'text-accentViolet', iconColor: '#8C7CFF' },
          { icon: Clock,      label: t.stats.card_spent,     value: `${displayHours}${t.stats.hours_unit}`, sub: displayHours > 0 && totalPeriodItems > 0 ? `~${Math.round(displayHours / totalPeriodItems)}ч/запись` : 'нет данных', color: 'text-blue-400', iconColor: '#60A5FA' },
          { icon: CheckCircle2, label: t.stats.card_completed, value: completedCount, sub: `${completionRate}% готово`, color: 'text-accentTeal', iconColor: '#00CEC9' },
        ].map(({ icon: Icon, label, value, sub, color, iconColor }) => (
          <div key={label} className="glass-card p-3 rounded-2xl border border-cardBorder flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <Icon style={{ color: iconColor }} className="w-3 h-3 shrink-0" />
              <span className="text-[10px] text-gray-400 truncate">{label}</span>
            </div>
            <div className={`text-xl font-extrabold ${color} leading-none`}>{value}</div>
            <div className="text-[9px] text-gray-400 leading-tight">{sub}</div>
          </div>
        ))}
      </div>

      {/* Status breakdown — 3 pill bars */}
      {totalPeriodItems > 0 && (
        <div className="glass-card p-4 rounded-2xl border border-cardBorder space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-accentViolet" />
              Статусы
            </span>
            <span className="text-[10px] text-gray-400">{totalPeriodItems} записей</span>
          </div>

          {[
            { label: 'Завершено',   count: completedCount,      color: '#00CEC9', pct: completionRate },
            { label: 'В процессе',  count: watchingItems.length, color: '#8C7CFF', pct: totalPeriodItems > 0 ? Math.round(watchingItems.length / totalPeriodItems * 100) : 0 },
            { label: 'Запланировано', count: plannedItems.length, color: '#FFB800', pct: totalPeriodItems > 0 ? Math.round(plannedItems.length / totalPeriodItems * 100) : 0 },
          ].map(({ label, count, color, pct }) => (
            <div key={label} className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-gray-300">{label}</span>
                <span className="font-bold text-white">{count} <span className="text-gray-400 font-normal">({pct}%)</span></span>
              </div>
              <div className="h-1.5 rounded-full bg-cardBorder/40 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: color }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Activity Bar Chart — NO background bars for zero values */}
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
            {totalPeriodItems} записей
          </div>
        </div>

        {/* Bars */}
        <div className="flex items-end gap-1.5 h-24 mt-2">
          {barCounts.map((count, idx) => {
            if (!hasBarData) {
              // show thin flat line if no data
              return (
                <div key={idx} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                  <div className="w-full h-0.5 rounded-full bg-cardBorder/30" />
                </div>
              );
            }
            const heightPct = count > 0 ? Math.max((count / maxBar) * 90, 12) : 0;
            const isPeak = count === maxBar && count > 0;
            return (
              <div key={idx} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
                {count > 0 && (
                  <span
                    className="text-[9px] font-bold leading-none shrink-0"
                    style={{ color: isPeak ? '#00CEC9' : '#8C7CFF' }}
                  >
                    {count}
                  </span>
                )}
                {count > 0 ? (
                  <div
                    className="w-full rounded-t-lg transition-all duration-300"
                    style={{
                      height: `${heightPct}%`,
                      background: isPeak
                        ? 'linear-gradient(to top, #00CEC9, #81ECE8)'
                        : 'linear-gradient(to top, rgba(140,124,255,0.5), #8C7CFF)',
                      boxShadow: isPeak ? '0 0 10px rgba(0,206,201,0.25)' : undefined,
                    }}
                  />
                ) : (
                  <div className="w-full h-0.5 rounded-full bg-cardBorder/30" />
                )}
              </div>
            );
          })}
        </div>

        {/* X-axis labels */}
        <div className="flex justify-between pt-1 border-t border-cardBorder/30">
          {barLabels.map((lbl, i) => (
            <span key={i} className="flex-1 text-center text-[9px] text-gray-400 font-medium">
              {lbl}
            </span>
          ))}
        </div>
      </div>

      {/* Category Distribution — horizontal progress bars, much cleaner */}
      {grandTotal > 0 && (
        <div className="glass-card p-4 rounded-2xl border border-cardBorder space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white">{t.stats.categories_title}</span>
            <span className="text-[10px] text-gray-400">{grandTotal} всего</span>
          </div>

          <div className="flex items-center gap-5">
            {/* Donut */}
            <div className="relative shrink-0 w-24 h-24">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.9155" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3.5" />
                {categorySegments.map((seg, idx) => {
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
                })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-extrabold text-white leading-none">{grandTotal}</span>
                <span className="text-[9px] text-gray-400">записей</span>
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
                    <span className="text-xs font-semibold text-gray-200 flex-1 truncate">{seg.cat}</span>
                    <span className="text-xs font-bold text-white">{seg.count}</span>
                    <span className="text-[10px] text-gray-400 w-8 text-right">{seg.percent}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Horizontal bar breakdown — no dark backgrounds */}
          <div className="space-y-2.5 pt-2 border-t border-cardBorder/40">
            {categorySegments.map((seg) => {
              const Icon = seg.meta.icon;
              return (
                <div key={seg.cat} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <Icon style={{ color: seg.meta.hex }} className="w-3.5 h-3.5" />
                      <span className="font-medium text-gray-300">{seg.cat}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-white">{seg.count}</span>
                      <span className="text-[10px] font-semibold" style={{ color: seg.meta.hex }}>{seg.percent}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-cardBorder/30 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
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
        {/* Top Category */}
        <div className="glass-card p-3.5 rounded-2xl border border-cardBorder space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-accentViolet">
            <Award className="w-3.5 h-3.5" />
            {t.stats.top_category}
          </div>
          {categorySegments[0] ? (
            <>
              <div className="text-sm font-extrabold text-white leading-tight">
                {categorySegments[0].cat}
              </div>
              <div className="text-[10px] text-gray-400">
                {categorySegments[0].count} карточек · {categorySegments[0].percent}%
              </div>
            </>
          ) : (
            <div className="text-xs text-gray-500">—</div>
          )}
        </div>

        {/* Avg Rating */}
        <div className="glass-card p-3.5 rounded-2xl border border-cardBorder space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-400">
            <Star className="w-3.5 h-3.5 fill-amber-400" />
            {t.stats.avg_rating}
          </div>
          <div className="text-sm font-extrabold text-white leading-tight">
            {avgRating}
            {avgRating !== '—' && <span className="text-xs font-normal text-gray-400 ml-1">/ 10</span>}
          </div>
          <div className="text-[10px] text-gray-400">
            {ratedItems.length > 0 ? `${ratedItems.length} оценено` : 'нет оценок'}
          </div>
        </div>

        {/* Avg per week */}
        <div className="glass-card p-3.5 rounded-2xl border border-cardBorder space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-accentTeal">
            <TrendingUp className="w-3.5 h-3.5" />
            Темп добавления
          </div>
          <div className="text-sm font-extrabold text-white leading-tight">
            {activeTabKey === 'week'
              ? `${totalPeriodItems} / нед.`
              : activeTabKey === 'month'
              ? `${(totalPeriodItems / 4).toFixed(1)} / нед.`
              : `${(totalPeriodItems / 52).toFixed(1)} / нед.`
            }
          </div>
          <div className="text-[10px] text-gray-400">
            записей в среднем
          </div>
        </div>

        {/* Watching right now */}
        <div className="glass-card p-3.5 rounded-2xl border border-cardBorder space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-400">
            <Clock className="w-3.5 h-3.5" />
            Сейчас смотрю
          </div>
          <div className="text-sm font-extrabold text-white leading-tight">
            {watchingItems.length}
          </div>
          <div className="text-[10px] text-gray-400">
            активных записей
          </div>
        </div>
      </div>
    </div>
  );
};
