import React from 'react';
import { Home, Search, BarChart3, User } from 'lucide-react';
import { Translations } from '../services/i18n';

interface NavbarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  t: Translations;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onTabChange, t }) => {
  const tabs = [
    { id: 'home', label: t.nav_home, icon: Home },
    { id: 'search', label: t.nav_search, icon: Search },
    { id: 'stats', label: t.nav_stats, icon: BarChart3 },
    { id: 'profile', label: t.nav_profile, icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-cardDark/95 backdrop-blur-md border-t border-cardBorder py-2 px-6 flex justify-between items-center z-30 shadow-lg">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`nav-item flex flex-col items-center gap-1 transition ${
              isActive ? 'active text-accentViolet font-semibold' : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[11.5px] font-medium">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
