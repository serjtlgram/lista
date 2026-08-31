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
  t,
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

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center p-5 animate-fade-in"
      onClick={onClose}
      style={{
        background: isLight ? 'rgba(15, 23, 42, 0.45)' : 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      {/* Modal Card */}
      <div
        className="w-full max-w-[340px] rounded-[28px] overflow-hidden animate-slide-up glass-card border border-cardBorder shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top gradient accent bar */}
        <div style={{ height: '3px', background: 'linear-gradient(90deg, rgb(var(--color-accentViolet)), rgba(var(--color-accentViolet), 0.4), #00CEC9)' }} />

        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-accentViolet/15 border border-accentViolet/30 text-accentViolet flex items-center justify-center shrink-0 shadow-md shadow-accentViolet/20">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">
                {title || 'Информация'}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <Sparkles className="w-2.5 h-2.5 text-accentViolet" />
                <span className="text-[10px] font-medium text-accentViolet/90">LISTA подсказка</span>
              </div>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-cardDark border border-cardBorder text-gray-400 hover:text-white flex items-center justify-center shrink-0 transition-all active:scale-[0.97]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-cardBorder mx-5" />

        {/* Message */}
        <div className="px-5 py-4">
          <p className="text-[13px] leading-relaxed font-normal text-gray-200">
            {message}
          </p>
        </div>

        {/* Button */}
        <div className="px-5 pb-5">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97] bg-accentViolet text-white shadow-lg shadow-accentViolet/25"
          >
            <Check className="w-4 h-4" strokeWidth={2.5} />
            <span>{t?.guide?.got_it || 'Понятно'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
