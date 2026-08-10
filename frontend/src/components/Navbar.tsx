import React from 'react';
import { Home, Search, BookMarked, User } from 'lucide-react';
import { Translations } from '../services/i18n';

interface NavbarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  t: Translations;
  isVisible?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onTabChange, t, isVisible = true }) => {
  const tabs = [
    { id: 'home', label: t.nav_home, icon: Home },
    { id: 'search', label: t.nav_search, icon: Search },
    { id: 'lists', label: t.nav_lists, icon: BookMarked },
    { id: 'profile', label: t.nav_profile, icon: User },
  ];

  return (
    <div
      className={`fixed bottom-[calc(3rem+env(safe-area-inset-bottom,0px))] inset-x-0 max-w-md mx-auto px-4 z-40 transition duration-300 ease-in-out ${
        isVisible ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-24 opacity-0 pointer-events-none'
      }`}
    >
      <nav className="w-full bg-cardDark/85 backdrop-blur-2xl border border-cardBorder rounded-[26px] py-1.5 px-2 flex justify-around items-center shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`nav-item flex flex-col items-center gap-0.5 py-1 px-3.5 rounded-2xl transition duration-200 ${
                isActive
                  ? 'active text-accentViolet bg-accentViolet/15 font-semibold scale-105 shadow-sm'
                  : 'text-gray-400 hover:text-gray-200 active:scale-95'
              }`}
            >
              <Icon className={`w-5 h-5 transition-transform duration-200 ${isActive ? 'scale-110' : ''}`} />
              <span className="text-[11px] font-medium leading-none">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
