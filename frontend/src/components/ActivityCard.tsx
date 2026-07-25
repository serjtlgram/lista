import React from 'react';

interface ActivityCardProps {
  monthlyCount?: number;
  monthlyHours?: number;
  currentStreak?: number;
}

export const ActivityCard: React.FC<ActivityCardProps> = ({
  monthlyCount = 9,
  monthlyHours = 18,
  currentStreak = 5,
}) => {
  return (
    <div className="glass-card p-4 rounded-2xl space-y-3">
      <div className="text-xs text-gray-400 font-medium">В этом месяце</div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-lg font-bold text-white">{monthlyCount}</div>
          <div className="text-[10px] text-gray-400">Добавлено</div>
        </div>
        <div>
          <div className="text-lg font-bold text-white">{monthlyHours}ч</div>
          <div className="text-[10px] text-gray-400">Потрачено</div>
        </div>
        <div>
          <div className="text-lg font-bold text-white">{currentStreak}</div>
          <div className="text-[10px] text-gray-400">Дней подряд</div>
        </div>
      </div>

      {/* Sparkline Wave Chart */}
      <div className="pt-2">
        <svg className="w-full h-12 overflow-visible" viewBox="0 0 300 40">
          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8C7CFF" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#8C7CFF" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          {/* Area */}
          <path d="M 0,30 Q 30,10 60,25 T 120,15 T 180,28 T 240,10 T 300,20 L 300,40 L 0,40 Z" fill="url(#chartGradient)"></path>
          {/* Line */}
          <path d="M 0,30 Q 30,10 60,25 T 120,15 T 180,28 T 240,10 T 300,20" fill="none" stroke="#8C7CFF" strokeWidth="2.5" strokeLinecap="round"></path>
          {/* Dots */}
          <circle cx="60" cy="25" r="3" fill="#8C7CFF"></circle>
          <circle cx="120" cy="15" r="3" fill="#8C7CFF"></circle>
          <circle cx="180" cy="28" r="3" fill="#8C7CFF"></circle>
          <circle cx="240" cy="10" r="4" fill="#00CEC9" stroke="#ffffff" strokeWidth="1.5"></circle>
        </svg>
      </div>
    </div>
  );
};
