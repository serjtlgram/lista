import React from 'react';
import { User as UserIcon } from 'lucide-react';
import { Translations } from '../services/i18n';

interface HeaderProps {
  userName: string;
  photoUrl?: string;
  onAvatarClick: () => void;
  t: Translations;
}

export const Header: React.FC<HeaderProps> = ({ userName, photoUrl, onAvatarClick, t }) => {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-1.5 text-white">
          {t.greeting}, <span id="user-name">{userName}</span>! <span className="text-lg">👋</span>
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">{t.what_to_add}</p>
      </div>

      {/* User Avatar Button replacing Bell Icon */}
      <button
        onClick={onAvatarClick}
        className="w-10 h-10 rounded-full bg-cardDark border border-cardBorder p-0.5 overflow-hidden flex items-center justify-center hover:border-accentViolet transition active:scale-95 shadow-md"
        title={t.nav_profile}
      >
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={userName}
            className="w-full h-full rounded-full object-cover"
            onError={(e) => {
              // Hide broken image link and show fallback icon
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full rounded-full bg-gradient-to-tr from-accentViolet to-accentTeal flex items-center justify-center text-white">
            {userName ? (
              <span className="text-xs font-bold uppercase">{userName.charAt(0)}</span>
            ) : (
              <UserIcon className="w-5 h-5 text-white" />
            )}
          </div>
        )}
      </button>
    </div>
  );
};
