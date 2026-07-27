import React from 'react';
import { Sparkles, TrendingUp } from 'lucide-react';
import { Item } from '../types';
import { Translations } from '../services/i18n';

interface ActivityCardProps {
  monthlyCount?: number;
  monthlyHours?: number;
  currentStreak?: number;
  items?: Item[];
  t: Translations;
}

export const ActivityCard: React.FC<ActivityCardProps> = ({
  monthlyCount = 0,
  monthlyHours = 0,
  currentStreak = 0,
  items = [],
  t,
}) => {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const monthItems = items.filter((item) => {
    if (!item.created_at && !item.completed_at) return true;
    const d = new Date(item.created_at || item.completed_at || '');
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  const displayCount = monthlyCount || monthItems.length || items.length;

  // Compute 4-week activity breakdown for current month
  const weekCounts = [0, 0, 0, 0];
  const targetItems = monthItems.length > 0 ? monthItems : items;

  targetItems.forEach((item) => {
    const dateStr = item.created_at || item.completed_at;
    if (dateStr) {
      const day = new Date(dateStr).getDate();
      if (day <= 7) weekCounts[0]++;
      else if (day <= 14) weekCounts[1]++;
      else if (day <= 21) weekCounts[2]++;
      else weekCounts[3]++;
    } else {
      weekCounts[0]++;
    }
  });

  const maxVal = Math.max(...weekCounts, 1);
  const coords = weekCounts.map((val, idx) => {
    const x = 30 + idx * 80;
    const y = 35 - (val / maxVal) * 25;
    return { x, y, val };
  });

  const pathD = `M 0,35 L ${coords[0].x},${coords[0].y} Q ${(coords[0].x + coords[1].x) / 2},${(coords[0].y + coords[1].y) / 2} ${coords[1].x},${coords[1].y} T ${coords[2].x},${coords[2].y} T ${coords[3].x},${coords[3].y} L 300,35`;
  const fillD = `${pathD} L 300,45 L 0,45 Z`;

  const peakIdx = weekCounts.indexOf(maxVal);

  return (
    <div className="glass-card p-4 rounded-2xl space-y-3.5 border border-cardBorder">
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-300 font-semibold flex items-center gap-1.5">
          <span>{t.activity.this_month}</span>
        </div>
        <span className="text-[10px] text-accentTeal font-medium bg-accentTeal/15 px-2 py-0.5 rounded-full flex items-center gap-1">
          <TrendingUp className="w-3 h-3" />
          Динамика
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-bgDark/40 p-2.5 rounded-xl border border-cardBorder/50">
          <div className="text-lg font-bold text-white">{displayCount}</div>
          <div className="text-[10px] text-gray-400">{t.activity.added}</div>
        </div>
        <div className="bg-bgDark/40 p-2.5 rounded-xl border border-cardBorder/50">
          <div className="text-lg font-bold text-white">
            {monthlyHours}
            {t.activity.hours_suffix}
          </div>
          <div className="text-[10px] text-gray-400">{t.activity.spent}</div>
        </div>
        <div className="bg-bgDark/40 p-2.5 rounded-xl border border-cardBorder/50">
          <div className="text-lg font-bold text-white">{currentStreak}</div>
          <div className="text-[10px] text-gray-400">{t.activity.streak}</div>
        </div>
      </div>

      {/* Informative Trend Chart Section */}
      <div className="pt-1 space-y-1.5">
        <div className="flex items-center justify-between text-[10px] text-gray-400 font-medium">
          <span className="flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-accentViolet" />
            Добавления по неделям месяца:
          </span>
          {displayCount > 0 && (
            <span className="text-accentViolet font-semibold">
              Пик: W{peakIdx + 1} ({maxVal} {t.details.elements_count})
            </span>
          )}
        </div>

        <div className="relative pt-2 pb-1">
          <svg className="w-full h-14 overflow-visible" viewBox="0 0 300 45">
            <defs>
              <linearGradient id="activityGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8C7CFF" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#8C7CFF" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <path d={fillD} fill="url(#activityGradient)"></path>
            <path d={pathD} fill="none" stroke="#8C7CFF" strokeWidth="2.5" strokeLinecap="round"></path>

            {coords.map((pt, idx) => (
              <g key={idx}>
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={idx === peakIdx ? 5 : 3.5}
                  fill={idx === peakIdx ? '#00CEC9' : '#8C7CFF'}
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
                {pt.val > 0 && (
                  <text
                    x={pt.x}
                    y={pt.y - 7}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="9"
                    fontWeight="bold"
                  >
                    +{pt.val}
                  </text>
                )}
              </g>
            ))}
          </svg>

          <div className="flex justify-between text-[9px] text-gray-400 font-medium px-2 pt-0.5">
            <span>1-7 дн</span>
            <span>8-14 дн</span>
            <span>15-21 дн</span>
            <span>22-31 дн</span>
          </div>
        </div>
      </div>
    </div>
  );
};
