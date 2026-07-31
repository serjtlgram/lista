import React from 'react';
import { Globe, Sun, Moon, Grid, ShieldCheck, User as UserIcon, ChevronRight, BarChart3 } from 'lucide-react';
import { Language, Translations } from '../services/i18n';
import { UserProfile } from '../types';

interface ProfileScreenProps {
  profile: UserProfile | null;
  currentLanguage: Language;
  onLanguageChange: (lang: Language) => void;
  currentTheme: string;
  onThemeChange: (theme: string) => void;
  activeCategories: string[];
  onOpenCategoryConfig: () => void;
  onGoToStats?: () => void;
  t: Translations;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  profile,
  currentLanguage,
  onLanguageChange,
  currentTheme,
  onThemeChange,
  activeCategories,
  onOpenCategoryConfig,
  onGoToStats,
  t,
}) => {
  const userName =
    (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.first_name ||
    profile?.user?.first_name ||
    'Пользователь';

  const userHandle =
    (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.username ||
    profile?.user?.username ||
    '';

  const photoUrl = profile?.user?.photo_url;

  // Language grid order: 1. Ukrainian, 2. English, 3. Spanish, 4. Russian
  const languages: { code: Language; name: string; flag: string }[] = [
    { code: 'uk', name: 'Українська', flag: '🇺🇦' },
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  ];

  return (
    <div className="space-y-4 pb-6 animate-slide-up">
      {/* User Header Profile Card */}
      <div className="glass-card rounded-3xl p-5 flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-accentViolet to-accentTeal p-0.5 shadow-lg shadow-accentViolet/20 shrink-0">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={userName}
              className="w-full h-full rounded-2xl object-cover"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-full h-full rounded-2xl bg-cardDark flex items-center justify-center text-white text-xl font-bold">
              {userName.charAt(0)}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-lg font-bold text-white">{userName}</h2>
          {userHandle && <p className="text-xs text-gray-400">@{userHandle}</p>}
          <div className="flex items-center gap-1 mt-1 text-[11px] text-accentTeal font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Lista User</span>
          </div>
        </div>
      </div>

      {/* Language Selection Card */}
      <div className="glass-card rounded-3xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Globe className="w-4 h-4 text-accentViolet" />
          <span>{t.profile.language}</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {languages.map((lang) => {
            const isActive = currentLanguage === lang.code;
            return (
              <button
                key={lang.code}
                onClick={() => onLanguageChange(lang.code)}
                className={`p-3 rounded-2xl text-xs font-semibold flex items-center gap-2.5 transition border ${
                  isActive
                    ? 'bg-accentViolet text-white border-accentViolet shadow-md shadow-accentViolet/30'
                    : 'bg-bgDark border-cardBorder text-gray-300 hover:border-gray-600'
                }`}
              >
                <span className="text-base">{lang.flag}</span>
                <span>{lang.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Theme Switcher Card */}
      <div className="glass-card rounded-3xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            {currentTheme.startsWith('light') ? (
              <Sun className="w-4 h-4 text-amber-500" />
            ) : (
              <Moon className="w-4 h-4 text-accentViolet" />
            )}
            <span>{t.profile.theme}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onThemeChange(currentTheme.startsWith('dark') ? currentTheme : 'dark')}
            className={`p-3 rounded-2xl text-xs font-semibold flex items-center justify-center gap-2 transition border ${
              currentTheme.startsWith('dark')
                ? 'bg-accentViolet text-white border-accentViolet shadow-md shadow-accentViolet/30'
                : 'bg-bgDark border-cardBorder text-gray-300 hover:border-gray-600'
            }`}
          >
            <Moon className="w-4 h-4" />
            <span>{t.profile.theme_dark}</span>
          </button>

          <button
            onClick={() => onThemeChange(currentTheme.startsWith('light') ? currentTheme : 'light')}
            className={`p-3 rounded-2xl text-xs font-semibold flex items-center justify-center gap-2 transition border ${
              currentTheme.startsWith('light')
                ? 'bg-accentViolet text-white border-accentViolet shadow-md shadow-accentViolet/30'
                : 'bg-bgDark border-cardBorder text-gray-300 hover:border-gray-600'
            }`}
          >
            <Sun className="w-4 h-4" />
            <span>{t.profile.theme_light}</span>
          </button>
        </div>

        {/* Color Theme Selector Circles */}
        <div className="flex justify-between px-6 pt-1">
          {/* Dark variants */}
          <div className="flex gap-3">
            <button
              onClick={() => onThemeChange('dark')}
              className={`w-6 h-6 rounded-full bg-[#0B0D14] border-2 flex items-center justify-center transition-all ${
                currentTheme === 'dark' ? 'border-[#6C5CE7] scale-110 shadow-md shadow-[#6C5CE7]/30' : 'border-gray-600 opacity-50 hover:opacity-100'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#6C5CE7]"></div>
            </button>
            <button
              onClick={() => onThemeChange('dark-black')}
              className={`w-6 h-6 rounded-full bg-[#000000] border-2 flex items-center justify-center transition-all ${
                currentTheme === 'dark-black' ? 'border-[#10B981] scale-110 shadow-md shadow-[#10B981]/30' : 'border-gray-600 opacity-50 hover:opacity-100'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#10B981]"></div>
            </button>
            <button
              onClick={() => onThemeChange('dark-navy')}
              className={`w-6 h-6 rounded-full bg-[#0f172a] border-2 flex items-center justify-center transition-all ${
                currentTheme === 'dark-navy' ? 'border-[#F59E0B] scale-110 shadow-md shadow-[#F59E0B]/30' : 'border-gray-600 opacity-50 hover:opacity-100'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]"></div>
            </button>
            <button
              onClick={() => onThemeChange('dark-neon')}
              className={`w-6 h-6 rounded-full bg-[#050505] border-2 flex items-center justify-center transition-all ${
                currentTheme === 'dark-neon' ? 'border-[#EC4899] scale-110 shadow-md shadow-[#EC4899]/30' : 'border-gray-600 opacity-50 hover:opacity-100'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#EC4899]"></div>
            </button>
          </div>
          
          {/* Light variants */}
          <div className="flex gap-3">
            <button
              onClick={() => onThemeChange('light')}
              className={`w-6 h-6 rounded-full bg-[#F8FAFC] border-2 flex items-center justify-center transition-all ${
                currentTheme === 'light' ? 'border-[#6C5CE7] scale-110 shadow-md shadow-[#6C5CE7]/30' : 'border-gray-400 opacity-50 hover:opacity-100'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#6C5CE7]"></div>
            </button>
            <button
              onClick={() => onThemeChange('light-powdery')}
              className={`w-6 h-6 rounded-full bg-[#FFF5F5] border-2 flex items-center justify-center transition-all ${
                currentTheme === 'light-powdery' ? 'border-[#D63384] scale-110 shadow-md shadow-[#D63384]/30' : 'border-gray-400 opacity-50 hover:opacity-100'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#D63384]"></div>
            </button>
            <button
              onClick={() => onThemeChange('light-mint')}
              className={`w-6 h-6 rounded-full bg-[#F0FDF4] border-2 flex items-center justify-center transition-all ${
                currentTheme === 'light-mint' ? 'border-[#059669] scale-110 shadow-md shadow-[#059669]/30' : 'border-gray-400 opacity-50 hover:opacity-100'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#059669]"></div>
            </button>
            <button
              onClick={() => onThemeChange('light-neon')}
              className={`w-6 h-6 rounded-full bg-[#ECFEFF] border-2 flex items-center justify-center transition-all ${
                currentTheme === 'light-neon' ? 'border-[#06B6D4] scale-110 shadow-md shadow-[#06B6D4]/30' : 'border-gray-400 opacity-50 hover:opacity-100'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#06B6D4]"></div>
            </button>
          </div>
        </div>
      </div>

      {/* Category Display Customizer Card */}
      <div className="glass-card rounded-3xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Grid className="w-4 h-4 text-accentTeal" />
            <span>{t.profile.categories_config}</span>
          </div>
          <span className="text-xs text-gray-400 font-medium">{activeCategories.length} / 6</span>
        </div>

        <button
          onClick={onOpenCategoryConfig}
          className="w-full p-3.5 rounded-2xl bg-bgDark border border-cardBorder text-gray-200 hover:text-white hover:border-accentViolet flex items-center justify-between text-xs font-semibold transition active:scale-[0.97]"
        >
          <span>{t.profile.categories_manage}</span>
          <div className="flex items-center gap-1 text-accentViolet font-bold">
            <span>{t.modal.edit_item}</span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </button>
      </div>

      {/* Statistics Navigation Card */}
      {onGoToStats && (
        <div
          onClick={onGoToStats}
          className="glass-card rounded-3xl p-4 cursor-pointer bg-gradient-to-r from-accentViolet/15 via-accentTeal/10 to-transparent border border-accentViolet/30 hover:border-accentViolet transition active:scale-[0.97] shadow-md group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-accentViolet/20 text-accentViolet flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  {t.stats.title}
                </h3>
                <p className="text-[11px] text-gray-400">
                  {t.lists.go_to_stats || 'Перейти к подробной статистике'}
                </p>
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-cardDark border border-cardBorder text-accentViolet flex items-center justify-center group-hover:bg-accentViolet group-hover:text-white transition">
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        </div>
      )}

      {/* Footer Info */}
      <div className="text-center pt-2 text-[11px] text-gray-500 space-y-0.5">
        <p>Lista App v1.2.0</p>
        <p>@manytgbot</p>
      </div>
    </div>
  );
};
