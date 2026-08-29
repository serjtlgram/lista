import React, { useState } from 'react';
import { Globe, Sun, Moon, Grid, ShieldCheck, User as UserIcon, ChevronRight, BarChart3, BookOpen } from 'lucide-react';
import { Language, Translations } from '../services/i18n';
import { UserProfile } from '../types';
import { GuideModal } from './GuideModal';

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
  const [isGuideOpen, setIsGuideOpen] = useState(false);

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

      {/* Statistics Navigation Card (Raised to Top) */}
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

      {/* How to Use Navigation Card (Directly Below Statistics) */}
      <div
        onClick={() => {
          const tg = (window as any).Telegram?.WebApp;
          if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
          setIsGuideOpen(true);
        }}
        className="glass-card rounded-3xl p-4 cursor-pointer bg-gradient-to-r from-accentTeal/15 via-accentViolet/10 to-transparent border border-accentTeal/30 hover:border-accentTeal transition active:scale-[0.97] shadow-md group"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-accentTeal/20 text-accentTeal flex items-center justify-center shrink-0 group-hover:scale-105 transition">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                {t.profile.how_to_use}
              </h3>
              <p className="text-[11px] text-gray-400">
                {t.profile.how_to_use_subtitle}
              </p>
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-cardDark border border-cardBorder text-accentTeal flex items-center justify-center group-hover:bg-accentTeal group-hover:text-white transition">
            <ChevronRight className="w-4 h-4" />
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
            onClick={() => {
              if (currentTheme.startsWith('dark')) return;
              const darkMap: Record<string, string> = {
                'light': 'dark',
                'light-powdery': 'dark-black',
                'light-mint': 'dark-navy',
                'light-neon': 'dark-neon',
                'light-nordic': 'dark-nordic',
                'light-talavera': 'dark-talavera',
                'light-terminal': 'dark-terminal',
                'light-brutalism': 'dark-brutalism',
              };
              onThemeChange(darkMap[currentTheme] || 'dark');
            }}
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
            onClick={() => {
              if (currentTheme.startsWith('light')) return;
              const lightMap: Record<string, string> = {
                'dark': 'light',
                'dark-black': 'light-powdery',
                'dark-navy': 'light-mint',
                'dark-neon': 'light-neon',
                'dark-nordic': 'light-nordic',
                'dark-talavera': 'light-talavera',
                'dark-terminal': 'light-terminal',
                'dark-brutalism': 'light-brutalism',
              };
              onThemeChange(lightMap[currentTheme] || 'light');
            }}
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

        {/* Row 1: Classic Themes */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          {/* Dark Classic variants */}
          <div className="flex justify-center gap-2 sm:gap-3">
            <button
              onClick={() => onThemeChange('dark')}
              title="Classic Dark"
              className={`w-6 h-6 rounded-full bg-[#0B0D14] border-2 flex items-center justify-center transition-all ${
                currentTheme === 'dark'
                  ? 'border-[#6C5CE7] scale-110 shadow-md shadow-[#6C5CE7]/40 ring-1 ring-[#6C5CE7]/50'
                  : 'border-gray-600 opacity-50 hover:opacity-100'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#6C5CE7]"></div>
            </button>
            <button
              onClick={() => onThemeChange('dark-black')}
              title="Onyx Black"
              className={`w-6 h-6 rounded-full bg-[#000000] border-2 flex items-center justify-center transition-all ${
                currentTheme === 'dark-black'
                  ? 'border-[#10B981] scale-110 shadow-md shadow-[#10B981]/40 ring-1 ring-[#10B981]/50'
                  : 'border-gray-600 opacity-50 hover:opacity-100'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#10B981]"></div>
            </button>
            <button
              onClick={() => onThemeChange('dark-navy')}
              title="Deep Navy"
              className={`w-6 h-6 rounded-full bg-[#0f172a] border-2 flex items-center justify-center transition-all ${
                currentTheme === 'dark-navy'
                  ? 'border-[#F59E0B] scale-110 shadow-md shadow-[#F59E0B]/40 ring-1 ring-[#F59E0B]/50'
                  : 'border-gray-600 opacity-50 hover:opacity-100'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]"></div>
            </button>
            <button
              onClick={() => onThemeChange('dark-neon')}
              title="Cyber Neon"
              className={`w-6 h-6 rounded-full bg-[#050505] border-2 flex items-center justify-center transition-all ${
                currentTheme === 'dark-neon'
                  ? 'border-[#EC4899] scale-110 shadow-md shadow-[#EC4899]/40 ring-1 ring-[#EC4899]/50'
                  : 'border-gray-600 opacity-50 hover:opacity-100'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#EC4899]"></div>
            </button>
          </div>
          
          {/* Light Classic variants */}
          <div className="flex justify-center gap-2 sm:gap-3">
            <button
              onClick={() => onThemeChange('light')}
              title="Classic Light"
              className={`w-6 h-6 rounded-full bg-[#F8FAFC] border-2 flex items-center justify-center transition-all ${
                currentTheme === 'light'
                  ? 'border-[#6C5CE7] scale-110 shadow-md shadow-[#6C5CE7]/40 ring-1 ring-[#6C5CE7]/50'
                  : 'border-gray-400 opacity-50 hover:opacity-100'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#6C5CE7]"></div>
            </button>
            <button
              onClick={() => onThemeChange('light-powdery')}
              title="Soft Rose"
              className={`w-6 h-6 rounded-full bg-[#FFF5F5] border-2 flex items-center justify-center transition-all ${
                currentTheme === 'light-powdery'
                  ? 'border-[#D63384] scale-110 shadow-md shadow-[#D63384]/40 ring-1 ring-[#D63384]/50'
                  : 'border-gray-400 opacity-50 hover:opacity-100'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#D63384]"></div>
            </button>
            <button
              onClick={() => onThemeChange('light-mint')}
              title="Fresh Mint"
              className={`w-6 h-6 rounded-full bg-[#F0FDF4] border-2 flex items-center justify-center transition-all ${
                currentTheme === 'light-mint'
                  ? 'border-[#059669] scale-110 shadow-md shadow-[#059669]/40 ring-1 ring-[#059669]/50'
                  : 'border-gray-400 opacity-50 hover:opacity-100'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#059669]"></div>
            </button>
            <button
              onClick={() => onThemeChange('light-neon')}
              title="Ice Cyan"
              className={`w-6 h-6 rounded-full bg-[#ECFEFF] border-2 flex items-center justify-center transition-all ${
                currentTheme === 'light-neon'
                  ? 'border-[#06B6D4] scale-110 shadow-md shadow-[#06B6D4]/40 ring-1 ring-[#06B6D4]/50'
                  : 'border-gray-400 opacity-50 hover:opacity-100'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#06B6D4]"></div>
            </button>
          </div>
        </div>

        {/* Row 2: Thematic Themes */}
        <div className="grid grid-cols-2 gap-2 pt-0.5">
          {/* Dark Thematic variants */}
          <div className="flex justify-center gap-2 sm:gap-3">
            {/* 1. Nordic Yule Dark */}
            <button
              onClick={() => onThemeChange('dark-nordic')}
              title="Nordic Yule (Dark)"
              className={`w-6 h-6 rounded-full bg-[#0D1114] border-2 flex items-center justify-center transition-all ${
                currentTheme === 'dark-nordic'
                  ? 'border-[#E5A93C] scale-110 shadow-md shadow-[#E5A93C]/40 ring-1 ring-[#E5A93C]/50'
                  : 'border-gray-600 opacity-50 hover:opacity-100'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#E5A93C]"></div>
            </button>

            {/* 2. Talavera & Marigold Dark */}
            <button
              onClick={() => onThemeChange('dark-talavera')}
              title="Día de Muertos (Dark)"
              className={`w-6 h-6 rounded-full bg-[#0A0A0B] border-2 flex items-center justify-center transition-all ${
                currentTheme === 'dark-talavera'
                  ? 'border-[#F06418] scale-110 shadow-md shadow-[#F06418]/40 ring-1 ring-[#F06418]/50'
                  : 'border-gray-600 opacity-50 hover:opacity-100'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#F06418]"></div>
            </button>

            {/* 3. Amber Terminal Dark */}
            <button
              onClick={() => onThemeChange('dark-terminal')}
              title="Amber Terminal (Dark)"
              className={`w-6 h-6 rounded-full bg-[#050505] border-2 flex items-center justify-center transition-all ${
                currentTheme === 'dark-terminal'
                  ? 'border-[#FF9E00] scale-110 shadow-md shadow-[#FF9E00]/40 ring-1 ring-[#FF9E00]/50'
                  : 'border-gray-600 opacity-50 hover:opacity-100'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#FF9E00]"></div>
            </button>

            {/* 4. Industrial Brutalism Dark */}
            <button
              onClick={() => onThemeChange('dark-brutalism')}
              title="Industrial Brutalism (Dark)"
              className={`w-6 h-6 rounded-full bg-[#141416] border-2 flex items-center justify-center transition-all ${
                currentTheme === 'dark-brutalism'
                  ? 'border-[#EAB308] scale-110 shadow-md shadow-[#EAB308]/40 ring-1 ring-[#EAB308]/50'
                  : 'border-gray-600 opacity-50 hover:opacity-100'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#EAB308]"></div>
            </button>
          </div>
          
          {/* Light Thematic variants */}
          <div className="flex justify-center gap-2 sm:gap-3">
            {/* 1. Nordic Yule Light */}
            <button
              onClick={() => onThemeChange('light-nordic')}
              title="Nordic Yule (Light)"
              className={`w-6 h-6 rounded-full bg-[#F5F7F6] border-2 flex items-center justify-center transition-all ${
                currentTheme === 'light-nordic'
                  ? 'border-[#245842] scale-110 shadow-md shadow-[#245842]/40 ring-1 ring-[#245842]/50'
                  : 'border-gray-400 opacity-50 hover:opacity-100'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#245842]"></div>
            </button>

            {/* 2. Talavera & Marigold Light */}
            <button
              onClick={() => onThemeChange('light-talavera')}
              title="Día de Muertos (Light)"
              className={`w-6 h-6 rounded-full bg-[#F8F5EE] border-2 flex items-center justify-center transition-all ${
                currentTheme === 'light-talavera'
                  ? 'border-[#D96216] scale-110 shadow-md shadow-[#D96216]/40 ring-1 ring-[#D96216]/50'
                  : 'border-gray-400 opacity-50 hover:opacity-100'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#D96216]"></div>
            </button>

            {/* 3. Amber Terminal Light */}
            <button
              onClick={() => onThemeChange('light-terminal')}
              title="Amber Terminal (Light)"
              className={`w-6 h-6 rounded-full bg-[#F3EDE2] border-2 flex items-center justify-center transition-all ${
                currentTheme === 'light-terminal'
                  ? 'border-[#A83B24] scale-110 shadow-md shadow-[#A83B24]/40 ring-1 ring-[#A83B24]/50'
                  : 'border-gray-400 opacity-50 hover:opacity-100'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#A83B24]"></div>
            </button>

            {/* 4. Industrial Brutalism Light */}
            <button
              onClick={() => onThemeChange('light-brutalism')}
              title="Industrial Brutalism (Light)"
              className={`w-6 h-6 rounded-full bg-[#E4E7EB] border-2 flex items-center justify-center transition-all ${
                currentTheme === 'light-brutalism'
                  ? 'border-[#0B5ED7] scale-110 shadow-md shadow-[#0B5ED7]/40 ring-1 ring-[#0B5ED7]/50'
                  : 'border-gray-400 opacity-50 hover:opacity-100'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#0B5ED7]"></div>
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

      {/* Footer Info */}
      <div className="text-center pt-2 text-[11px] text-gray-500 space-y-0.5">
        <p>Lista App v1.2.0</p>
        <p>@manytgbot</p>
      </div>

      {/* User Guide Modal */}
      <GuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        t={t}
      />
    </div>
  );
};
