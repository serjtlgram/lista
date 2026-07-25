import React, { useState } from 'react';
import { StatsData } from '../types';
import { Translations } from '../services/i18n';

interface StatsScreenProps {
  stats?: StatsData | null;
  t: Translations;
}

export const StatsScreen: React.FC<StatsScreenProps> = ({ stats, t }) => {
  const [activeTabKey, setActiveTabKey] = useState<'week' | 'month' | 'year' | 'all'>('month');

  const periodTabs = [
    { key: 'week', label: t.stats.tab_week },
    { key: 'month', label: t.stats.tab_month },
    { key: 'year', label: t.stats.tab_year },
    { key: 'all', label: t.stats.tab_all },
  ];

  const totalItems = stats?.total_items || 0;
  const weeklyBars = stats?.weekly_activity && totalItems > 0 ? stats.weekly_activity : [0, 0, 0, 0, 0, 0, 0];

  return (
    <div className="space-y-4 animate-slide-up pb-6">
      <h1 className="text-base font-bold text-center text-white">{t.stats.title}</h1>

      {/* Time Filter Tabs */}
      <div className="grid grid-cols-4 gap-1 p-1 bg-cardDark rounded-xl border border-cardBorder text-xs text-center">
        {periodTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTabKey(tab.key as any)}
            className={`py-1.5 rounded-lg transition ${
              activeTabKey === tab.key
                ? 'bg-accentViolet text-white font-semibold shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Top Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="glass-card p-3 rounded-2xl">
          <div className="text-[10px] text-gray-400 font-medium">{t.stats.card_added}</div>
          <div className="text-base font-bold text-white mt-1">{stats?.monthly_added || 0}</div>
          <div className="text-[9px] text-gray-500 flex items-center mt-0.5">0%</div>
        </div>
        <div className="glass-card p-3 rounded-2xl">
          <div className="text-[10px] text-gray-400 font-medium">{t.stats.card_spent}</div>
          <div className="text-base font-bold text-white mt-1">{stats?.total_hours || 0}{t.stats.hours_unit}</div>
          <div className="text-[9px] text-gray-500 flex items-center mt-0.5">0%</div>
        </div>
        <div className="glass-card p-3 rounded-2xl">
          <div className="text-[10px] text-gray-400 font-medium">{t.stats.card_completed}</div>
          <div className="text-base font-bold text-white mt-1">{stats?.completed_items || 0}</div>
          <div className="text-[9px] text-gray-500 flex items-center mt-0.5">0%</div>
        </div>
      </div>

      {/* Bar chart representation */}
      <div className="glass-card p-4 rounded-2xl space-y-2">
        <div className="text-xs font-semibold text-gray-300">{t.stats.activity_title}</div>
        <div className="flex items-end justify-between h-24 pt-4 gap-1">
          {weeklyBars.map((height, idx) => (
            <div
              key={idx}
              className={`w-full rounded-t transition-all ${
                height > 0 ? 'bg-accentViolet' : 'bg-cardBorder/40 h-1'
              }`}
              style={{ height: height > 0 ? `${height}%` : '4px' }}
            ></div>
          ))}
        </div>
        <div className="flex justify-between text-[9px] text-gray-500 pt-1">
          <span>1</span>
          <span>8</span>
          <span>15</span>
          <span>22</span>
          <span>29</span>
        </div>
      </div>

      {/* Donut Category Share */}
      <div className="glass-card p-4 rounded-2xl space-y-3">
        <div className="text-xs font-semibold text-gray-300">{t.stats.categories_title}</div>
        {totalItems > 0 ? (
          <div className="flex items-center justify-between">
            <div className="relative w-24 h-24">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path strokeDasharray="100, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#6C5CE7" strokeWidth="4.5" />
              </svg>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-6">
                <span className="flex items-center gap-1.5 text-gray-300"><span className="w-2.5 h-2.5 rounded-full bg-accentViolet"></span> {t.stats.active_legend}</span>
                <span className="font-bold text-white">100%</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-xs text-gray-500">
            {t.recently_added.empty}
          </div>
        )}
      </div>
    </div>
  );
};
