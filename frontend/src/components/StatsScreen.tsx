import React, { useState } from 'react';
import { StatsData } from '../types';

interface StatsScreenProps {
  stats?: StatsData | null;
}

export const StatsScreen: React.FC<StatsScreenProps> = ({ stats }) => {
  const [period, setPeriod] = useState('Месяц');

  const periods = ['Неделя', 'Месяц', 'Год', 'Всё время'];

  const totalItems = stats?.total_items || 0;
  const weeklyBars = stats?.weekly_activity && totalItems > 0 ? stats.weekly_activity : [0, 0, 0, 0, 0, 0, 0];

  return (
    <div className="space-y-4">
      <h1 className="text-base font-bold text-center">Статистика</h1>

      {/* Time Filter Tabs */}
      <div className="grid grid-cols-4 gap-1 p-1 bg-cardDark rounded-xl border border-cardBorder text-xs text-center">
        {periods.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`py-1.5 rounded-lg transition ${
              period === p
                ? 'bg-accentViolet text-white font-semibold'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Top Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="glass-card p-3 rounded-2xl">
          <div className="text-[10px] text-gray-400">Добавлено</div>
          <div className="text-base font-bold text-white mt-1">{stats?.monthly_added || 0}</div>
          <div className="text-[9px] text-gray-500 flex items-center mt-0.5">0%</div>
        </div>
        <div className="glass-card p-3 rounded-2xl">
          <div className="text-[10px] text-gray-400">Потрачено</div>
          <div className="text-base font-bold text-white mt-1">{stats?.total_hours || 0}ч</div>
          <div className="text-[9px] text-gray-500 flex items-center mt-0.5">0%</div>
        </div>
        <div className="glass-card p-3 rounded-2xl">
          <div className="text-[10px] text-gray-400">Завершено</div>
          <div className="text-base font-bold text-white mt-1">{stats?.completed_items || 0}</div>
          <div className="text-[9px] text-gray-500 flex items-center mt-0.5">0%</div>
        </div>
      </div>

      {/* Bar chart representation */}
      <div className="glass-card p-4 rounded-2xl space-y-2">
        <div className="text-xs font-semibold text-gray-300">Активность</div>
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
          <span>1 май</span>
          <span>8 май</span>
          <span>15 май</span>
          <span>22 май</span>
          <span>29 май</span>
        </div>
      </div>

      {/* Donut Category Share */}
      <div className="glass-card p-4 rounded-2xl space-y-3">
        <div className="text-xs font-semibold text-gray-300">Распределение по категориям</div>
        {totalItems > 0 ? (
          <div className="flex items-center justify-between">
            <div className="relative w-24 h-24">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path strokeDasharray="100, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#6C5CE7" strokeWidth="4.5" />
              </svg>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-6">
                <span className="flex items-center gap-1.5 text-gray-300"><span class="w-2.5 h-2.5 rounded-full bg-accentViolet"></span> Активно</span>
                <span className="font-bold">100%</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-xs text-gray-500">
            Нет сохраненных данных для отображения графиков
          </div>
        )}
      </div>
    </div>
  );
};
