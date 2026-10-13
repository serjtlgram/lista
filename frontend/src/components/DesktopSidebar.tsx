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
  Sparkles,
} from 'lucide-react';
import { Translations } from '../services/i18n';

interface DesktopSidebarProps {
  activeTab: string;
  onTabChange: (tab: any) => void;
  userName: string;
  userHandle?: string;
  photoUrl?: string;
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

  return (
    <aside className="hidden lg:flex flex-col w-64 xl:w-72 h-screen sticky top-0 border-r border-cardBorder bg-cardDark/70 backdrop-blur-2xl p-5 select-none z-30 justify-between shrink-0">
      {/* Top Section */}
      <div className="space-y-6">
        {/* Logo / Brand Header */}
        <div className="flex items-center gap-3 px-1">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-accentViolet via-purple-500 to-accentTeal p-0.5 shadow-lg shadow-accentViolet/30 flex items-center justify-center">
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
          className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-accentViolet to-purple-600 hover:from-accentViolet/90 hover:to-purple-500 text-white font-bold text-xs shadow-lg shadow-accentViolet/30 flex items-center justify-center gap-2 transition active:scale-[0.98]"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>{t.modal?.add_item || 'Добавить запись'}</span>
        </button>

        {/* Navigation Links */}
        <nav className="space-y-1.5 pt-1">
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

      {/* Bottom Section: Stats & Quick Overview */}
      <div className="pt-4 border-t border-cardBorder space-y-3">
        {currentStreak > 0 && (
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-semibold">
            <span className="flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 fill-orange-400" />
              <span>Серия активности</span>
            </span>
            <span className="font-bold">{currentStreak} дн.</span>
          </div>
        )}

        <div className="flex items-center justify-between text-[11px] text-gray-400 px-1 font-medium">
          <span>Всего в коллекции</span>
          <span className="text-white font-bold">{itemsCount}</span>
        </div>
      </div>
    </aside>
  );
};
