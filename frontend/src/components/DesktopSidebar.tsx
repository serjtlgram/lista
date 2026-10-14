import React from 'react';
import {
  Home,
  Search,
  BookMarked,
  BarChart3,
  User,
  Plus,
  Flame,
  Layers,
} from 'lucide-react';
import { Item } from '../types';
import { Translations } from '../services/i18n';
import { normCat } from '../utils/watchTime';

interface DesktopSidebarProps {
  activeTab: string;
  onTabChange: (tab: any) => void;
  userName: string;
  userHandle?: string;
  photoUrl?: string;
  items?: Item[];
  itemsCount: number;
  currentStreak?: number;
  onOpenAddItem: () => void;
  t: Translations;
}

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({
  activeTab,
  onTabChange,
  userName,
  userHandle,
  photoUrl,
  items = [],
  itemsCount,
  currentStreak = 0,
  onOpenAddItem,
  t,
}) => {
  const navItems = [
    { id: 'home', label: t.nav_home || 'Главная', icon: Home },
    { id: 'search', label: t.nav_search || 'Каталог', icon: Search },
    { id: 'lists', label: t.nav_lists || 'Списки', icon: BookMarked },
    { id: 'stats', label: t.stats?.title || 'Статистика', icon: BarChart3 },
    { id: 'profile', label: t.nav_profile || 'Профиль', icon: User },
  ];

  // Collection breakdown calculations by real categories (Фильмы, Сериалы, Книги, Игры)
  const total = items.length;
  const categoryCounts: Record<string, number> = {
    'Фильмы': 0,
    'Сериалы': 0,
    'Книги': 0,
    'Игры': 0,
  };

  items.forEach((item) => {
    const cat = normCat(item.category);
    if (categoryCounts[cat] !== undefined) {
      categoryCounts[cat]++;
    } else if (cat) {
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
  });

  const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
    'Фильмы':  { label: t.categories?.movies || 'Фильмы',  color: '#8C7CFF' },
    'Сериалы': { label: t.categories?.shows || 'Сериалы',  color: '#00CEC9' },
    'Книги':   { label: t.categories?.books || 'Книги',    color: '#FFB800' },
    'Игры':    { label: t.categories?.games || 'Игры',     color: '#00B894' },
  };

  const activeCategories = Object.entries(categoryCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  let currentAccumLen = 0;
  const segments = activeCategories.map(([cat, count]) => {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const len = total > 0 ? (count / total) * 100 : 0;
    const cfg = CATEGORY_CONFIG[cat] || { label: cat, color: '#38BDF8' };
    const seg = {
      key: cat,
      label: cfg.label,
      count,
      pct,
      len,
      color: cfg.color,
      accum: currentAccumLen,
    };
    currentAccumLen += len;
    return seg;
  });

  return (
    <aside className="hidden lg:flex flex-col w-64 xl:w-72 h-screen sticky top-0 border-r border-cardBorder bg-cardDark/70 backdrop-blur-2xl p-4 xl:p-5 select-none z-30 shrink-0 overflow-y-auto hide-scrollbar space-y-4">
      {/* Top Section */}
      <div className="space-y-4">
        {/* Logo / Brand Header */}
        <div className="flex items-center gap-3 px-1">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-accentViolet via-purple-500 to-accentTeal p-0.5 shadow-lg shadow-accentViolet/30 flex items-center justify-center shrink-0">
            <div className="w-full h-full bg-cardDark rounded-[14px] flex items-center justify-center">
              <Layers className="w-5 h-5 text-accentViolet" />
            </div>
          </div>
          <div>
            <div className="text-lg font-black tracking-wider text-white flex items-center gap-1.5">
              <span>LISTA</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accentViolet/20 text-accentViolet font-bold tracking-normal">
                PRO
              </span>
            </div>
            <p className="text-[11px] text-gray-400 font-medium">Медиатека & трекер</p>
          </div>
        </div>

        {/* User Profile Mini Card */}
        <button
          onClick={() => onTabChange('profile')}
          className="w-full p-2.5 rounded-2xl bg-cardBorder/30 hover:bg-cardBorder/60 border border-cardBorder transition text-left flex items-center gap-3 group active:scale-[0.98]"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-accentViolet to-accentTeal p-0.5 shrink-0 shadow-sm">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={userName}
                className="w-full h-full rounded-[10px] object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-full h-full rounded-[10px] bg-cardDark flex items-center justify-center text-white text-sm font-bold">
                {userName ? userName.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-white truncate group-hover:text-accentViolet transition-colors">
              {userName || 'Пользователь'}
            </div>
            {userHandle && (
              <div className="text-[10px] text-gray-400 truncate">@{userHandle}</div>
            )}
          </div>
        </button>

        {/* Primary Action Button: Add Item */}
        <button
          onClick={onOpenAddItem}
          style={{ color: '#FFFFFF' }}
          className="btn-add-item w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-accentViolet to-purple-600 hover:from-accentViolet/90 hover:to-purple-500 text-white font-bold text-xs shadow-lg shadow-accentViolet/30 flex items-center justify-center gap-2 transition active:scale-[0.98]"
        >
          <Plus className="w-4 h-4 stroke-[2.5] text-white" style={{ color: '#FFFFFF' }} />
          <span className="text-white" style={{ color: '#FFFFFF' }}>{t.modal?.add_item || 'Добавить запись'}</span>
        </button>

        {/* Navigation Links */}
        <nav className="desktop-sidebar-nav space-y-1 p-2 rounded-2xl bg-cardBorder/30 border border-cardBorder shadow-sm overflow-hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              activeTab === item.id || (item.id === 'search' && activeTab === 'details');

            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
                  isActive
                    ? 'bg-accentViolet/15 text-accentViolet border border-accentViolet/30 shadow-sm font-bold'
                    : 'text-gray-300 hover:text-white hover:bg-cardBorder/40 border border-transparent'
                }`}
              >
                <Icon
                  className={`w-4 h-4 transition-transform ${
                    isActive ? 'scale-110 text-accentViolet' : 'text-gray-400'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Lifted Section: My Collection Donut Widget (Screen 1 & Screen 2) */}
      <div className="pt-3 border-t border-cardBorder space-y-2.5">
        {/* Collection Header */}
        <div className="flex items-center gap-2.5 px-1">
          <div className="w-7 h-7 rounded-lg bg-accentTeal/15 border border-accentTeal/30 flex items-center justify-center shrink-0 text-accentTeal">
            <Layers className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-white tracking-wide">Моя коллекция</div>
            <div className="text-[10px] text-gray-400 font-medium">
              {itemsCount} {itemsCount === 1 ? 'элемент' : itemsCount < 5 ? 'элемента' : 'элементов'}
            </div>
          </div>
        </div>

        {/* Donut Chart & Legend */}
        {itemsCount > 0 ? (
          <div className="flex items-center gap-2.5 p-2 rounded-xl bg-cardDark/80 border border-cardBorder/60 shadow-inner">
            {/* SVG Donut */}
            <div className="relative shrink-0 w-14 h-14">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.9155" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4.5" />
                {segments.map((seg, idx) => {
                  if (seg.len <= 0) return null;
                  const dash = `${seg.len} ${100 - seg.len}`;
                  const offset = -seg.accum;
                  return (
                    <circle
                      key={idx}
                      cx="18"
                      cy="18"
                      r="15.9155"
                      fill="none"
                      stroke={seg.color}
                      strokeWidth="4.5"
                      strokeDasharray={dash}
                      strokeDashoffset={offset}
                      strokeLinecap="butt"
                    />
                  );
                })}
              </svg>
            </div>

            {/* Legend */}
            <div className="flex-1 space-y-0.5 text-[10px] min-w-0">
              {segments.map((seg) => (
                <div key={seg.key} className="flex items-center justify-between text-gray-300">
                  <span className="flex items-center gap-1.5 truncate">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                    <span className="truncate">{seg.label}</span>
                  </span>
                  <span className="font-bold text-white font-mono ml-1">{seg.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-2.5 rounded-xl bg-cardDark/40 border border-cardBorder/40 text-center text-[10px] text-gray-500">
            Коллекция пуста
          </div>
        )}

        {currentStreak > 0 && (
          <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[10px] font-semibold">
            <span className="flex items-center gap-1.5">
              <Flame className="w-3 h-3 fill-orange-400" />
              <span>Серия активности</span>
            </span>
            <span className="font-bold">{currentStreak} дн.</span>
          </div>
        )}
      </div>
    </aside>
  );
};
