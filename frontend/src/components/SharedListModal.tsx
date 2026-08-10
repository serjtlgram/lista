import React, { useState } from 'react';
import { BookMarked, Download, Check, X, Film, Tv, Book, Gamepad2, Popcorn, Star } from 'lucide-react';
import { Item } from '../types';
import { createList, addItemToList } from '../services/lists';
import { api } from '../services/api';
import { Translations, formatCategorySingle } from '../services/i18n';
import { getItemPoster } from '../services/posters';

interface SharedListModalProps {
  isOpen: boolean;
  sharedListTitle: string;
  sharedItems: Item[];
  userItems: Item[];
  onClose: () => void;
  onSuccessImport: (newListId: string, newlyCreatedItems?: Item[]) => void;
  t: Translations;
}

export const SharedListModal: React.FC<SharedListModalProps> = ({
  isOpen,
  sharedListTitle,
  sharedItems,
  userItems,
  onClose,
  onSuccessImport,
  t,
}) => {
  const [isImporting, setIsImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);

  if (!isOpen) return null;

  const triggerHaptic = () => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.impactOccurred('medium');
    }
  };

  const handleImportAll = async () => {
    triggerHaptic();
    setIsImporting(true);

    try {
      // 1. Create new list with shared title
      const newList = createList(sharedListTitle);

      const norm = (s?: string) => (s || '').trim().toLowerCase();
      const newlyCreatedItems: Item[] = [];

      // 2. Add each item to user database & list
      for (const item of sharedItems) {
        const existing = [...userItems, ...newlyCreatedItems].find((ui) => norm(ui.title) === norm(item.title) && ui.release_year === item.release_year);
        let targetId = existing?.id;

        if (!targetId) {
          const payload: Partial<Item> = {
            title: item.title,
            category: item.category || 'Фильмы',
            status: 'planned',
            rating: item.rating || 0,
            public_rating: item.public_rating || '',
            genre: item.genre || '',
            duration: item.duration || '',
            release_year: item.release_year || '',
            poster_url: item.poster_url || '',
            description: item.description || '',
            youtube_url: item.youtube_url || '',
            director: item.director || '',
            cast: item.cast || '',
            author: item.author || '',
            isbn: item.isbn || '',
            note: item.note || '',
            country: item.country || '',
          };
          const created = await api.createItem(payload);
          if (created?.id) {
            targetId = created.id;
            newlyCreatedItems.push(created);
          }
        }

        if (targetId) {
          addItemToList(newList.id, targetId);
        }
      }

      setImportDone(true);
      setTimeout(() => {
        onSuccessImport(newList.id, newlyCreatedItems);
      }, 500);
    } catch (e) {
      console.error('Failed to import shared list:', e);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="w-full max-w-md bg-cardDark border border-cardBorder rounded-3xl p-5 space-y-4 animate-slide-up shadow-2xl max-h-[85vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-cardBorder pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-accentViolet/20 text-accentViolet flex items-center justify-center">
              <BookMarked className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white truncate max-w-[200px]">
                {sharedListTitle}
              </h2>
              <p className="text-[11px] text-gray-400">
                {sharedItems.length} {t.lists?.items_count || 'элементов'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full bg-bgDark border border-cardBorder text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Button: Import entire list */}
        <div className="shrink-0">
          <button
            onClick={handleImportAll}
            disabled={isImporting || importDone}
            className={`w-full py-3.5 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition active:scale-[0.97] ${
              importDone
                ? 'bg-accentTeal text-white'
                : 'bg-gradient-to-r from-accentViolet to-accentTeal text-white hover:opacity-95'
            }`}
          >
            {importDone ? (
              <>
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Список сохранён в вашу библиотеку!</span>
              </>
            ) : isImporting ? (
              <span>Сохранение списка...</span>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>➕ Добавить весь список себе</span>
              </>
            )}
          </button>
        </div>

        {/* Items List Preview */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 hide-scrollbar">
          {sharedItems.map((item, idx) => {
            const posterSrc = getItemPoster(item);
            const categoryLabel = formatCategorySingle(item.category, t);
            const catLower = (item.category || '').toLowerCase();
            const isBook = catLower === 'книги' || catLower === 'книга' || catLower === 'book' || catLower === 'books';
            const hasPublicRating = Boolean(item.public_rating && item.public_rating.trim() !== '');
            const hasUserRating = Boolean(item.rating && item.rating > 0);

            return (
              <div
                key={item.id || idx}
                className="glass-card p-3 rounded-2xl flex items-center gap-3 border border-cardBorder/60"
              >
                <img
                  src={posterSrc}
                  alt={item.title}
                  className="w-10 h-14 object-cover rounded-xl shrink-0 bg-gray-800"
                />
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-white truncate">{item.title}</h4>
                  <p className="text-[10px] text-gray-400">
                    {categoryLabel} {item.release_year ? `• ${item.release_year}` : ''} {item.genre ? `• ${item.genre}` : ''}
                  </p>
                  {hasPublicRating ? (
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-orange-400 mt-0.5">
                      {isBook ? (
                        <Star className="w-3 h-3 text-orange-400 fill-orange-400/20 shrink-0" />
                      ) : (
                        <Popcorn className="w-3 h-3 text-orange-400 shrink-0" />
                      )}
                      <span>{item.public_rating}</span>
                    </div>
                  ) : hasUserRating ? (
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-400 mt-0.5">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />
                      <span>{item.rating}/10</span>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
