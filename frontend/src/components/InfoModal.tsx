import React from 'react';
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
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center p-5 animate-fade-in"
      onClick={onClose}
      style={{
        background: 'radial-gradient(ellipse at 50% 30%, rgba(108,92,231,0.25) 0%, rgba(0,0,0,0.75) 70%)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      {/* Modal Card */}
      <div
        className="w-full max-w-[340px] rounded-[28px] overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(145deg, rgba(30,25,55,0.98) 0%, rgba(18,15,40,0.99) 100%)',
          boxShadow: '0 40px 80px -20px rgba(0,0,0,0.8), 0 0 0 1px rgba(108,92,231,0.25), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      >
        {/* Top glow accent bar */}
        <div
          style={{
            height: '3px',
            background: 'linear-gradient(90deg, #6C5CE7, #a29bfe, #00CEC9)',
          }}
        />

        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Icon with glow */}
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
              style={{
                background: 'linear-gradient(135deg, rgba(108,92,231,0.3) 0%, rgba(108,92,231,0.1) 100%)',
                border: '1px solid rgba(108,92,231,0.4)',
                boxShadow: '0 0 20px rgba(108,92,231,0.3)',
              }}
            >
              <Info className="w-5 h-5" style={{ color: '#a29bfe' }} />
            </div>
            <div>
              <div
                className="text-sm font-bold"
                style={{ color: '#f8f9fa' }}
              >
                {title || 'Информация'}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <Sparkles className="w-2.5 h-2.5" style={{ color: '#a29bfe' }} />
                <span
                  className="text-[10px] font-medium"
                  style={{ color: 'rgba(162,155,254,0.8)' }}
                >
                  LISTA подсказка
                </span>
              </div>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-90"
            style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.5)',
            }}
            onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.12)'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
            onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)'; }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Divider */}
        <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '0 20px' }} />

        {/* Message body */}
        <div className="px-5 py-4">
          <p
            className="text-[13px] leading-relaxed font-normal"
            style={{ color: 'rgba(220,220,235,0.9)' }}
          >
            {message}
          </p>
        </div>

        {/* Action Button */}
        <div className="px-5 pb-5">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #6C5CE7 0%, #8B7EFF 50%, #6C5CE7 100%)',
              backgroundSize: '200% 100%',
              boxShadow: '0 8px 25px -5px rgba(108,92,231,0.55)',
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
