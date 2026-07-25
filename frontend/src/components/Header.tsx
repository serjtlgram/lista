import React from 'react';
import { Bell } from 'lucide-react';

interface HeaderProps {
  userName: string;
  onBellClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ userName, onBellClick }) => {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-1.5">
          Привет, <span id="user-name">{userName}</span>! <span className="text-lg">👋</span>
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">Что сегодня добавим?</p>
      </div>
      <button 
        onClick={onBellClick} 
        className="p-2.5 rounded-full bg-cardDark border border-cardBorder text-gray-300 relative hover:bg-gray-800 transition"
      >
        <Bell className="w-5 h-5" />
        <span className="absolute top-2 right-2 w-2 h-2 bg-accentViolet rounded-full ring-2 ring-bgDark"></span>
      </button>
    </div>
  );
};
