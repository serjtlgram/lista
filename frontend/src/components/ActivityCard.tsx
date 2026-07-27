import React from 'react';
import { TrendingUp, Flame, Plus, CheckCircle2 } from 'lucide-react';
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
    if (!item.created_at && !item.completed_at) return false;
    const d = new Date(item.created_at || item.completed_at || '');
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  const displayCount = monthlyCount || monthItems.length || 0;

  // Completed this month
  const completedThisMonth = monthItems.filter(
    (i) => i.status === 'completed' || i.status === 'Просмотрено' || i.status === 'Завершено'
  ).length;

  // Compute 4-week activity breakdown for current month — only real month data
  const weekCounts = [0, 0, 0, 0];
  monthItems.forEach((item) => {
    const dateStr = item.created_at || item.completed_at;
    if (dateStr) {
      const day = new Date(dateStr).getDate();
      if (day <= 7) weekCounts[0]++;
      else if (day <= 14) weekCounts[1]++;
      else if (day <= 21) weekCounts[2]++;
      else weekCounts[3]++;
    }
  });

  const maxVal = Math.max(...weekCounts, 1);
  const hasRealData = weekCounts.some((v) => v > 0);

  // Build smooth SVG path from 4 control points
  const pts = weekCounts.map((val, idx) => {
    const x = 30 + idx * 82;
    const y = hasRealData ? 32 - (val / maxVal) * 22 : 32;
    return { x, y, val };
  });

  // Catmull-Rom to smooth cubic bezier
  const smoothPath = () => {
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

  const linePath = smoothPath();
  const fillPath = `${linePath} L ${pts[pts.length - 1].x},38 L ${pts[0].x},38 Z`;
  const peakIdx = weekCounts.indexOf(maxVal);

  const weekLabels = ['1–7', '8–14', '15–21', '22–31'];

  return (
    <div className="glass-card p-4 rounded-2xl border border-cardBorder space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-white">{t.activity.this_month}</span>
        {currentStreak > 0 && (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded-full">
            <Flame className="w-3 h-3" />
            {currentStreak} дн. подряд
          </span>
        )}
      </div>

      {/* 3 Stat Rows (no gray backgrounds — just clean dividers) */}
      <div className="flex items-stretch divide-x divide-cardBorder">
        <div className="flex-1 flex flex-col items-center gap-0.5 pr-4 text-center">
          <div className="flex items-center gap-1 text-accentViolet">
            <Plus className="w-3.5 h-3.5" />
          </div>
          <div className="text-2xl font-extrabold text-white leading-none">{displayCount}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">{t.activity.added}</div>
        </div>

        <div className="flex-1 flex flex-col items-center gap-0.5 px-4 text-center">
          <div className="text-[10px] text-gray-400 mt-0.5">{t.activity.spent}</div>
          <div className="text-2xl font-extrabold text-white leading-none">
            {monthlyHours}<span className="text-base font-normal text-gray-400 ml-0.5">{t.activity.hours_suffix}</span>
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">≈ времени</div>
        </div>

        <div className="flex-1 flex flex-col items-center gap-0.5 pl-4 text-center">
          <div className="flex items-center gap-1 text-accentTeal">
            <CheckCircle2 className="w-3.5 h-3.5" />
          </div>
          <div className="text-2xl font-extrabold text-accentTeal leading-none">{completedThisMonth}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">завершено</div>
        </div>
      </div>

      {/* Sparkline area chart — pure SVG, no HTML boxes */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-gray-400 font-medium flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-accentViolet" />
            Активность по неделям
          </span>
          {hasRealData && (
            <span className="text-[10px] font-semibold text-accentViolet">
              пик W{peakIdx + 1} (+{maxVal})
            </span>
          )}
        </div>

        <svg className="w-full overflow-visible" viewBox="0 0 290 50" preserveAspectRatio="none">
          <defs>
            <linearGradient id="acGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8C7CFF" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#8C7CFF" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {hasRealData ? (
            <>
              <path d={fillPath} fill="url(#acGrad)" />
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
                    <text
                      x={pt.x} y={pt.y - 8}
                      textAnchor="middle"
                      fill="#8C7CFF"
                      fontSize="9"
                      fontWeight="bold"
                    >
                      +{pt.val}
                    </text>
                  )}
                </g>
              ))}
            </>
          ) : (
            <line x1="0" y1="34" x2="290" y2="34" stroke="#334155" strokeWidth="1.5" strokeDasharray="4 4" />
          )}
        </svg>

        <div className="flex justify-between text-[9px] text-gray-400 mt-1 px-1">
          {weekLabels.map((lbl, i) => (
            <span key={i} className="text-center" style={{ width: '25%' }}>{lbl} дн</span>
          ))}
        </div>
      </div>
    </div>
  );
};
