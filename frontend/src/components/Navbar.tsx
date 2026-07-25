import React from 'react';
import { Home, Search, BarChart3, User } from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'home', label: 'Главная', icon: Home },
    { id: 'search', label: 'Поиск', icon: Search },
    { id: 'stats', label: 'Статистика', icon: BarChart3 },
    { id: 'profile', label: 'Профиль', icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-cardDark/95 backdrop-blur-md border-t border-cardBorder py-2 px-6 flex justify-between items-center z-30">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`nav-item flex flex-col items-center gap-1 transition ${
              isActive ? 'active text-[#8C7CFF]' : 'text-gray-400'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
