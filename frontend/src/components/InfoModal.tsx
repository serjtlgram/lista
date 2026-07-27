import React from 'react';
import { Info, X, Check } from 'lucide-react';
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
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md transition-opacity duration-200 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="glass-card w-full max-w-sm rounded-3xl p-5 border border-cardBorder shadow-2xl space-y-4 relative animate-slide-up transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-accentViolet/15 border border-accentViolet/30 text-accentViolet flex items-center justify-center shrink-0 shadow-inner">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white leading-tight">
                {title || 'Информация'}
              </h3>
              <p className="text-[10px] text-gray-400 font-medium">LISTA подсказка</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-cardDark/60 border border-cardBorder text-gray-400 hover:text-white flex items-center justify-center transition active:scale-90"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="bg-bgDark/40 p-3.5 rounded-2xl border border-cardBorder/60 text-xs sm:text-[13px] text-gray-200 leading-relaxed font-normal">
          {message}
        </div>

        {/* Action Button */}
        <button
          onClick={onClose}
          className="w-full py-2.5 px-4 rounded-xl bg-accentViolet text-white font-semibold text-xs sm:text-sm shadow-lg shadow-accentViolet/30 hover:bg-accentViolet/90 active:scale-95 transition flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4" />
          <span>Понятно</span>
        </button>
      </div>
    </div>
  );
};
