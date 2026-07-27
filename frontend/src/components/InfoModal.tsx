import React, { useEffect, useState } from 'react';
import { X, Info, Check, Sparkles } from 'lucide-react';
import { Translations } from '../services/i18n';

interface InfoModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  onClose: () => void;
  t?: Translations;
}

export const InfoModal: React.FC<InfoModalProps> = ({
  isOpen,
  title,
  message,
  onClose,
}) => {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    const update = () => setIsLight(document.body.classList.contains('light'));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  if (!isOpen) return null;

  // ── Dark theme styles ────────────────────────────────────────────────────
  const darkOverlay = 'radial-gradient(ellipse at 50% 30%, rgba(108,92,231,0.28) 0%, rgba(0,0,0,0.80) 70%)';
  const darkCard: React.CSSProperties = {
    background: 'linear-gradient(145deg, rgba(30,25,55,0.98) 0%, rgba(18,15,40,0.99) 100%)',
    boxShadow: '0 40px 80px -20px rgba(0,0,0,0.8), 0 0 0 1px rgba(108,92,231,0.25), inset 0 1px 0 rgba(255,255,255,0.08)',
  };
  const darkDivider: React.CSSProperties = { height: '1px', background: 'rgba(255,255,255,0.06)', margin: '0 20px' };
  const darkIcon: React.CSSProperties = {
    background: 'linear-gradient(135deg, rgba(108,92,231,0.3) 0%, rgba(108,92,231,0.1) 100%)',
    border: '1px solid rgba(108,92,231,0.4)',
    boxShadow: '0 0 20px rgba(108,92,231,0.3)',
  };
  const darkIconColor = '#a29bfe';
  const darkTitle: React.CSSProperties = { color: '#f8f9fa' };
  const darkSubtitle: React.CSSProperties = { color: 'rgba(162,155,254,0.85)' };
  const darkCloseBtn: React.CSSProperties = {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.5)',
  };
  const darkText: React.CSSProperties = { color: 'rgba(220,220,235,0.9)' };

  // ── Light theme styles ───────────────────────────────────────────────────
  const lightOverlay = 'radial-gradient(ellipse at 50% 30%, rgba(108,92,231,0.18) 0%, rgba(15,23,42,0.55) 70%)';
  const lightCard: React.CSSProperties = {
    background: 'linear-gradient(145deg, #ffffff 0%, #f8f7ff 100%)',
    boxShadow: '0 40px 80px -20px rgba(108,92,231,0.2), 0 0 0 1px rgba(108,92,231,0.12), 0 8px 32px rgba(0,0,0,0.12)',
  };
  const lightDivider: React.CSSProperties = { height: '1px', background: 'rgba(108,92,231,0.1)', margin: '0 20px' };
  const lightIcon: React.CSSProperties = {
    background: 'linear-gradient(135deg, rgba(108,92,231,0.15) 0%, rgba(108,92,231,0.06) 100%)',
    border: '1px solid rgba(108,92,231,0.3)',
    boxShadow: '0 0 16px rgba(108,92,231,0.15)',
  };
  const lightIconColor = '#6C5CE7';
  const lightTitle: React.CSSProperties = { color: '#0F172A' };
  const lightSubtitle: React.CSSProperties = { color: 'rgba(108,92,231,0.75)' };
  const lightCloseBtn: React.CSSProperties = {
    background: 'rgba(108,92,231,0.06)',
    border: '1px solid rgba(108,92,231,0.15)',
    color: '#94A3B8',
  };
  const lightText: React.CSSProperties = { color: '#334155' };

  const overlay  = isLight ? lightOverlay  : darkOverlay;
  const card     = isLight ? lightCard     : darkCard;
  const divider  = isLight ? lightDivider  : darkDivider;
  const iconBg   = isLight ? lightIcon     : darkIcon;
  const iconClr  = isLight ? lightIconColor: darkIconColor;
  const titleSty = isLight ? lightTitle    : darkTitle;
  const subtSty  = isLight ? lightSubtitle : darkSubtitle;
  const closeBtn = isLight ? lightCloseBtn : darkCloseBtn;
  const textSty  = isLight ? lightText     : darkText;

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center p-5 animate-fade-in"
      onClick={onClose}
      style={{
        background: overlay,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      {/* Modal Card */}
      <div
        className="w-full max-w-[340px] rounded-[28px] overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
        style={card}
      >
        {/* Top gradient accent bar */}
        <div style={{ height: '3px', background: 'linear-gradient(90deg, #6C5CE7, #a29bfe, #00CEC9)' }} />

        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={iconBg}>
              <Info className="w-5 h-5" style={{ color: iconClr }} />
            </div>
            <div>
              <div className="text-sm font-bold" style={titleSty}>
                {title || 'Информация'}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <Sparkles className="w-2.5 h-2.5" style={{ color: iconClr }} />
                <span className="text-[10px] font-medium" style={subtSty}>LISTA подсказка</span>
              </div>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-90"
            style={closeBtn}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Divider */}
        <div style={divider} />

        {/* Message */}
        <div className="px-5 py-4">
          <p className="text-[13px] leading-relaxed font-normal" style={textSty}>
            {message}
          </p>
        </div>

        {/* Button */}
        <div className="px-5 pb-5">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #6C5CE7 0%, #8B7EFF 100%)',
              boxShadow: isLight
                ? '0 8px 20px -4px rgba(108,92,231,0.4)'
                : '0 8px 25px -5px rgba(108,92,231,0.55)',
              color: '#ffffff',
            }}
          >
            <Check className="w-4 h-4" strokeWidth={2.5} />
            <span>Понятно</span>
          </button>
        </div>
      </div>
    </div>
  );
};
