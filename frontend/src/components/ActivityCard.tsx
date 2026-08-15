import React, { useState } from 'react';
import { Flame, Plus, CheckCircle2, Info, ChevronRight } from 'lucide-react';
import { Item } from '../types';
import { Translations } from '../services/i18n';
import { computeWatchHours, getLastNDays, countItemsPerSlot, dayStart } from '../utils/watchTime';
import { InfoModal } from './InfoModal';
import { ItemCard } from './ItemCard';

interface ActivityCardProps {
  monthlyCount?: number;
  monthlyHours?: number;
  currentStreak?: number;
  items: Item[];
  onShowStats: () => void;
  onUpdateItem?: (id: string, updates: Partial<Item>) => void;
  t: Translations;
}



export const ActivityCard: React.FC<ActivityCardProps> = ({
  monthlyCount = 0,
  currentStreak = 0,
  items = [],
  onShowStats,
  onUpdateItem,
  t,
}) => {
  const [viewMode, setViewMode] = useState<'month' | 'all'>('month');

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Items added this calendar month
  const monthItems = items.filter((item) => {
    const dateStr = item.created_at || item.completed_at;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  const monthDisplayCount = monthlyCount || monthItems.length || 0;
  const allDisplayCount = items.length;

  // Completed items count
  const completedThisMonth = monthItems.filter(
    (i) => ['completed', 'Просмотрено', 'Завершено', 'Завершён'].includes(i.status || '')
  ).length;

  const completedAllTime = items.filter(
    (i) => ['completed', 'Просмотрено', 'Завершено', 'Завершён'].includes(i.status || '')
  ).length;

  // Watch hours — only completed movies/shows, calculated from item durations
  const watchHours = computeWatchHours(items); // all time total
  const monthWatchHours = computeWatchHours(monthItems);

  // Sparkline data for Month (4 weeks of current month)
  const weekCounts = [0, 0, 0, 0];
  monthItems.forEach((item) => {
    const dateStr = item.created_at || item.completed_at;
    if (!dateStr) return;
    const day = new Date(dateStr).getDate();
    if (day <= 7) weekCounts[0]++;
    else if (day <= 14) weekCounts[1]++;
    else if (day <= 21) weekCounts[2]++;
    else weekCounts[3]++;
  });

  // Sparkline data for All Time (Last 4 Months)
  const last4MonthsSlots = Array.from({ length: 4 }, (_, i) => {
    return new Date(now.getFullYear(), now.getMonth() - (3 - i), 1);
  });

  const monthCountsAll = [0, 0, 0, 0];
  items.forEach((item) => {
    const dateStr = item.created_at || item.completed_at;
    if (!dateStr) return;
    const itemDate = new Date(dateStr);
    for (let i = 0; i < last4MonthsSlots.length; i++) {
      const slot = last4MonthsSlots[i];
      const nextSlot = last4MonthsSlots[i + 1] ?? new Date(now.getFullYear(), now.getMonth() + 1, 1);
      if (itemDate >= slot && itemDate < nextSlot) {
        monthCountsAll[i]++;
        break;
      }
    }
  });

  const activeSparklineCounts = viewMode === 'month' ? weekCounts : monthCountsAll;
  const maxVal = Math.max(...activeSparklineCounts, 1);
  const hasRealData = activeSparklineCounts.some((v) => v > 0);
  const peakIdx = activeSparklineCounts.indexOf(Math.max(...activeSparklineCounts));

  // Build smooth SVG sparkline (Catmull-Rom → Cubic Bezier)
  const pts = activeSparklineCounts.map((val, idx) => ({
    x: 20 + idx * 85,
    y: hasRealData ? 30 - (val / maxVal) * 22 : 30,
    val,
  }));

  const buildPath = () => {
    if (pts.length < 2) return '';
    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return d;
  };

  const linePath = buildPath();
  const fillPath = `${linePath} L ${pts[pts.length - 1].x},38 L ${pts[0].x},38 Z`;

  const sparklineLabels = viewMode === 'month'
    ? ['1–7 дн', '8–14 дн', '15–21 дн', '22–31 дн']
    : last4MonthsSlots.map((d) => t.stats.short_months[d.getMonth()]);

  const activeDisplayCount = viewMode === 'month' ? monthDisplayCount : allDisplayCount;
  const activeHours = viewMode === 'month' ? monthWatchHours : watchHours;
  const activeCompleted = viewMode === 'month' ? completedThisMonth : completedAllTime;

  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);

  const renderWatchTime = (hours: number) => {
    if (hours < 24) {
      return (
        <>{hours}<span className="text-base font-normal text-gray-400 ml-0.5">{t.activity.hours_suffix}</span></>
      );
    }
    const days = hours / 24;
    if (days < 30.5) {
      const d = Math.floor(days);
      return (
        <>{d}<span className="text-base font-normal text-gray-400 ml-0.5">{t.activity.days_suffix}</span></>
      );
    }
    const months = days / 30.5;
    if (months < 12) {
      const formatted = months.toFixed(1).replace(/\.0$/, '').replace('.', ',');
      return (
        <>{formatted}<span className="text-base font-normal text-gray-400 ml-0.5">{t.stats.months_suffix || 'мес'}</span></>
      );
    }
    const years = days / 365;
    const formatted = years.toFixed(1).replace(/\.0$/, '').replace('.', ',');
    return (
      <>{formatted}<span className="text-base font-normal text-gray-400 ml-0.5">{t.stats.years_suffix || 'г'}</span></>
    );
  };

  return (
    <>
      <InfoModal
        isOpen={isInfoModalOpen}
        message={t.stats.hours_info_message}
        onClose={() => setIsInfoModalOpen(false)}
        t={t}
      />
      <div className="glass-card p-4 rounded-2xl border border-cardBorder space-y-4">
      {/* Header with Mode Switcher */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-cardBorder/40 p-0.5 rounded-lg text-xs font-semibold">
          <button
            onClick={() => setViewMode('month')}
            className={`px-2.5 py-1 rounded-md transition-all ${
              viewMode === 'month'
                ? 'bg-accentViolet text-white shadow-sm font-bold'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {t.activity.this_month}
          </button>
          <button
            onClick={() => setViewMode('all')}
            className={`px-2.5 py-1 rounded-md transition-all ${
              viewMode === 'all'
                ? 'bg-accentViolet text-white shadow-sm font-bold'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {t.activity.all_time}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {currentStreak > 0 && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded-full">
              <Flame className="w-3 h-3" />
              {currentStreak} дн.
            </span>
          )}
          {onShowStats && (
            <button
              onClick={onShowStats}
              className="text-xs font-bold text-accentViolet hover:underline flex items-center gap-0.5 active:scale-[0.97] transition"
            >
              <span>{t.stats.full_stats}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 3 Stats — clean divider layout, no gray boxes */}
      <div className="flex items-stretch divide-x divide-cardBorder">
        <div className="flex-1 flex flex-col items-center gap-1 pr-4 text-center">
          <Plus className="w-3.5 h-3.5 text-accentViolet" />
          <div className="text-2xl font-extrabold text-white leading-none">{activeDisplayCount}</div>
          <div className="text-[10px] text-gray-400">{t.activity.added}</div>
        </div>

        <div className="flex-1 flex flex-col items-center gap-1 px-4 text-center">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400">{t.activity.spent}</span>
            <button
              onClick={() => setIsInfoModalOpen(true)}
              className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-gray-400 hover:text-accentViolet transition-colors active:scale-[0.97]"
              aria-label="О расчёте времени"
            >
              <Info className="w-3 h-3" />
            </button>
          </div>
          <div className="text-2xl font-extrabold text-white leading-none">
            {renderWatchTime(activeHours)}
          </div>
          <div className="text-[10px] text-gray-500">{t.stats.approx_watch_time}</div>
        </div>

        <div className="flex-1 flex flex-col items-center gap-1 pl-4 text-center">
          <CheckCircle2 className="w-3.5 h-3.5 text-accentTeal" />
          <div className="text-2xl font-extrabold text-accentTeal leading-none">{activeCompleted}</div>
          <div className="text-[10px] text-gray-400">{t.stats.completed_items}</div>
        </div>
      </div>

      {/* Sparkline — Catmull-Rom smooth curve, labels in accent color */}
      <div>
        <svg className="w-full overflow-visible" viewBox="0 0 290 42" preserveAspectRatio="none">
          <defs>
            <linearGradient id="acGradAct" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8C7CFF" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#8C7CFF" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {hasRealData ? (
            <>
              <path d={fillPath} fill="url(#acGradAct)" />
              <path d={linePath} fill="none" stroke="#8C7CFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              {pts.map((pt, idx) => (
                <g key={idx}>
                  <circle
                    cx={pt.x} cy={pt.y}
                    r={idx === peakIdx ? 5 : 3.5}
                    fill={idx === peakIdx ? '#00CEC9' : '#8C7CFF'}
                    stroke="white" strokeWidth="1.5"
                  />
                  {pt.val > 0 && (
                    <text x={pt.x} y={pt.y - 8} textAnchor="middle" fill={idx === peakIdx ? '#00CEC9' : '#8C7CFF'} fontSize="8.5" fontWeight="bold">
                      +{pt.val}
                    </text>
                  )}
                </g>
              ))}
            </>
          ) : (
            <line x1="0" y1="30" x2="290" y2="30" stroke="#334155" strokeWidth="1.5" strokeDasharray="4 4" />
          )}
        </svg>

        <div className="flex justify-between text-[9px] text-gray-400 mt-1">
          {sparklineLabels.map((lbl, i) => (
            <span key={i} className="text-center" style={{ width: '25%' }}>{lbl}</span>
          ))}
        </div>
      </div>
    </div>
    </>
  );
};
