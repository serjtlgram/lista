import React, { useState, useEffect } from 'react';
import { X, Check, Film, Tv, BookOpen, Headphones, Mic, Gamepad2, AlertCircle } from 'lucide-react';
import { Translations } from '../services/i18n';

interface CategorySelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeCategories: string[];
  onSave: (categories: string[]) => void;
  t: Translations;
}

export const ALL_CATEGORIES = [
  { key: 'Фильмы', icon: Film, bg: 'bg-accentViolet/15', text: 'text-accentViolet' },
  { key: 'Сериалы', icon: Tv, bg: 'bg-accentTeal/15', text: 'text-accentTeal' },
  { key: 'Книги', icon: BookOpen, bg: 'bg-accentAmber/15', text: 'text-accentAmber' },
  { key: 'Аудиокниги', icon: Headphones, bg: 'bg-accentBlue/15', text: 'text-accentBlue' },
  { key: 'Подкасты', icon: Mic, bg: 'bg-accentPink/15', text: 'text-accentPink' },
  { key: 'Игры', icon: Gamepad2, bg: 'bg-accentGreen/15', text: 'text-accentGreen' },
];

export const CategorySelectModal: React.FC<CategorySelectModalProps> = ({
  isOpen,
  onClose,
  activeCategories,
  onSave,
  t,
}) => {
  const [selected, setSelected] = useState<string[]>(activeCategories);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelected(activeCategories);
      setErrorMsg(null);
    }
  }, [isOpen, activeCategories]);

  if (!isOpen) return null;

  const getTranslatedCategoryName = (catKey: string): string => {
    switch (catKey) {
      case 'Фильмы':
        return t.categories.movies;
      case 'Сериалы':
        return t.categories.shows;
      case 'Книги':
        return t.categories.books;
      case 'Аудиокниги':
        return t.categories.audiobooks;
      case 'Подкасты':
        return t.categories.podcasts;
      case 'Игры':
        return t.categories.games;
      default:
        return catKey;
    }
  };

  const handleToggle = (catKey: string) => {
    setErrorMsg(null);
    if (selected.includes(catKey)) {
      if (selected.length <= 2) {
        setErrorMsg(t.category_modal.min_warning);
        return;
      }
      setSelected(selected.filter((c) => c !== catKey));
    } else {
      setSelected([...selected, catKey]);
    }
  };

  const handleSave = () => {
    if (selected.length < 2) {
      setErrorMsg(t.category_modal.min_warning);
      return;
    }
    onSave(selected);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="w-full max-w-md bg-cardDark border-t sm:border border-cardBorder rounded-t-3xl sm:rounded-3xl p-5 space-y-4 animate-slide-up shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-cardBorder">
          <div>
            <h3 className="text-base font-bold text-white">{t.category_modal.title}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{t.category_modal.subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-bgDark border border-cardBorder text-gray-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Warning Toast */}
        {errorMsg && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-semibold animate-pulse">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Categories List */}
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {ALL_CATEGORIES.map((cat) => {
            const isChecked = selected.includes(cat.key);
            const Icon = cat.icon;
            const displayName = getTranslatedCategoryName(cat.key);

            return (
              <div
                key={cat.key}
                onClick={() => handleToggle(cat.key)}
                className={`flex items-center justify-between p-3 rounded-2xl cursor-pointer transition border ${
                  isChecked
                    ? 'bg-accentViolet/10 border-accentViolet/50'
                    : 'bg-bgDark border-cardBorder hover:border-gray-600'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl ${cat.bg} flex items-center justify-center ${cat.text}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-semibold text-gray-200">{displayName}</span>
                </div>

                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center transition border ${
                    isChecked
                      ? 'bg-accentViolet border-accentViolet text-white'
                      : 'border-cardBorder bg-bgDark text-transparent'
                  }`}
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Save Action */}
        <button
          onClick={handleSave}
          className="w-full py-3 rounded-xl bg-accentViolet text-white font-bold text-sm shadow-lg shadow-accentViolet/30 hover:bg-opacity-90 active:scale-98 transition"
        >
          {t.category_modal.save}
        </button>
      </div>
    </div>
  );
};
