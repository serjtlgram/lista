import React, { useEffect, useState, useRef } from 'react';
import {
  X,
  BookOpen,
  FolderTree,
  Search,
  Bot,
  Sliders,
  Sparkles,
  BarChart3,
  Palette,
  Check,
  Lightbulb,
  ChevronRight,
  Compass,
} from 'lucide-react';
import { Translations } from '../services/i18n';

interface GuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  t: Translations;
  currentTheme?: string;
}

export const GuideModal: React.FC<GuideModalProps> = ({ isOpen, onClose, t, currentTheme }) => {
  const [isThemeLight, setIsThemeLight] = useState<boolean>(() => {
    if (currentTheme) return currentTheme.startsWith('light');
    if (typeof document !== 'undefined') {
      return Array.from(document.body.classList).some((c) => c.startsWith('light'));
    }
    return false;
  });
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentTheme) {
      setIsThemeLight(currentTheme.startsWith('light'));
    }
  }, [currentTheme]);

  useEffect(() => {
    const update = () => {
      if (currentTheme) {
        setIsThemeLight(currentTheme.startsWith('light'));
      } else {
        setIsThemeLight(Array.from(document.body.classList).some((c) => c.startsWith('light')));
      }
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [currentTheme]);

  if (!isOpen) return null;

  const triggerHaptic = () => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.impactOccurred('light');
    }
  };

  const handleClose = () => {
    triggerHaptic();
    onClose();
  };

  const scrollToSection = (key: string) => {
    triggerHaptic();
    const el = document.getElementById(`guide-section-${key}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const sectionsConfig = [
    {
      key: 'lists_folders' as const,
      icon: FolderTree,
      iconColor: '#8C7CFF',
      iconBg: 'rgba(140, 124, 255, 0.15)',
      iconColorLight: '#6C5CE7',
      iconBgLight: 'rgba(108, 92, 231, 0.12)',
      data: t.guide.sections.lists_folders,
    },
    {
      key: 'adding_search' as const,
      icon: Search,
      iconColor: '#00CEC9',
      iconBg: 'rgba(0, 206, 201, 0.15)',
      iconColorLight: '#0D9488',
      iconBgLight: 'rgba(13, 148, 136, 0.12)',
      data: t.guide.sections.adding_search,
    },
    {
      key: 'telegram_bot' as const,
      icon: Bot,
      iconColor: '#60A5FA',
      iconBg: 'rgba(96, 165, 250, 0.15)',
      iconColorLight: '#2563EB',
      iconBgLight: 'rgba(37, 99, 235, 0.12)',
      data: t.guide.sections.telegram_bot,
    },
    {
      key: 'item_details' as const,
      icon: Sliders,
      iconColor: '#F59E0B',
      iconBg: 'rgba(245, 158, 11, 0.15)',
      iconColorLight: '#D97706',
      iconBgLight: 'rgba(217, 119, 6, 0.12)',
      data: t.guide.sections.item_details,
    },
    {
      key: 'ai_features' as const,
      icon: Sparkles,
      iconColor: '#EC4899',
      iconBg: 'rgba(236, 72, 153, 0.15)',
      iconColorLight: '#DB2777',
      iconBgLight: 'rgba(219, 39, 119, 0.12)',
      data: t.guide.sections.ai_features,
    },
    {
      key: 'statistics' as const,
      icon: BarChart3,
      iconColor: '#10B981',
      iconBg: 'rgba(16, 185, 129, 0.15)',
      iconColorLight: '#059669',
      iconBgLight: 'rgba(5, 150, 105, 0.12)',
      data: t.guide.sections.statistics,
    },
    {
      key: 'customization' as const,
      icon: Palette,
      iconColor: '#A855F7',
      iconBg: 'rgba(168, 85, 247, 0.15)',
      iconColorLight: '#9333EA',
      iconBgLight: 'rgba(147, 51, 234, 0.12)',
      data: t.guide.sections.customization,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[999] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md bg-cardDark border-t sm:border border-cardBorder rounded-t-[32px] sm:rounded-3xl flex flex-col h-[93vh] max-h-[93vh] sm:h-auto sm:max-h-[88vh] animate-slide-up shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top gradient accent line */}
        <div style={{ height: '3px', background: 'linear-gradient(90deg, rgb(var(--color-accentViolet)), rgba(var(--color-accentViolet), 0.5), #00CEC9)' }} />

        {/* Modal Header */}
        <div className="px-5 pt-5 pb-3.5 flex items-center justify-between border-b border-cardBorder shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-accentViolet/20 text-accentViolet flex items-center justify-center shrink-0 shadow-md shadow-accentViolet/10">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">
                {t.guide.modal_title}
              </h3>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {t.guide.modal_subtitle}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-bgDark border border-cardBorder text-gray-400 hover:text-white flex items-center justify-center transition active:scale-[0.97]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Guide Content */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Quick Navigation / Table of Contents */}
          <div className="glass-card rounded-2xl p-3.5 space-y-2.5 border border-cardBorder">
            <div className="flex items-center gap-2 text-xs font-bold text-white px-0.5">
              <Compass className="w-4 h-4 text-accentViolet" />
              <span>{t.guide.quick_nav}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {sectionsConfig.map((sec) => {
                const Icon = sec.icon;
                const item = sec.data;
                if (!item) return null;
                const iconBg = isThemeLight ? sec.iconBgLight : sec.iconBg;
                const iconColor = isThemeLight ? sec.iconColorLight : sec.iconColor;

                return (
                  <button
                    key={sec.key}
                    onClick={() => scrollToSection(sec.key)}
                    className="w-full p-2.5 rounded-xl flex items-center justify-between text-left transition active:scale-[0.98] bg-bgDark border border-cardBorder hover:border-accentViolet/50"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: iconBg, color: iconColor }}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="truncate">
                        <div className="text-xs font-bold text-white truncate">
                          {item.title}
                        </div>
                        <div className="text-[10px] text-gray-400 truncate">
                          {item.badge}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-accentViolet shrink-0 ml-1" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detailed Guide Sections */}
          {sectionsConfig.map((sec) => {
            const Icon = sec.icon;
            const item = sec.data;
            if (!item) return null;
            const iconBg = isThemeLight ? sec.iconBgLight : sec.iconBg;
            const iconColor = isThemeLight ? sec.iconColorLight : sec.iconColor;

            return (
              <div
                id={`guide-section-${sec.key}`}
                key={sec.key}
                className="glass-card rounded-2xl p-4 space-y-3 transition border border-cardBorder scroll-mt-2"
              >
                {/* Section Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: iconBg, color: iconColor }}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full inline-block mb-0.5"
                        style={{ background: iconBg, color: iconColor }}
                      >
                        {item.badge}
                      </span>
                      <h4 className="text-sm font-bold text-white leading-snug">
                        {item.title}
                      </h4>
                    </div>
                  </div>
                </div>

                {/* Section Description */}
                <p className="text-[13px] text-gray-300 leading-relaxed font-normal">
                  {item.description}
                </p>

                {/* Bullet Points */}
                {item.bullets && item.bullets.length > 0 && (
                  <div className="space-y-2 pt-1 border-t border-cardBorder">
                    {item.bullets.map((bullet, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-gray-300 leading-relaxed">
                        <div
                          className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                          style={{ background: iconColor }}
                        />
                        <span>{bullet}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tip Box */}
                {item.tip && (
                  <div className="p-3 rounded-xl flex items-start gap-2.5 text-xs font-medium leading-relaxed bg-accentViolet/10 border border-accentViolet/25 text-gray-300">
                    <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <span className="flex-1">{item.tip}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer Action Button */}
        <div className="p-4 border-t border-cardBorder bg-cardDark shrink-0">
          <button
            onClick={handleClose}
            className="w-full py-3.5 rounded-2xl bg-accentViolet text-white font-bold text-sm shadow-lg shadow-accentViolet/30 hover:bg-opacity-90 active:scale-[0.97] transition flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            <span>{t.guide.got_it}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
