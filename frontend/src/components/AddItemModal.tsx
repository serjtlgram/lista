import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Item } from '../types';
import { Translations } from '../services/i18n';

interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: Partial<Item>) => void;
  editingItem?: Item | null;
  t: Translations;
}

const compressPosterImage = (url: string): Promise<string> => {
  if (!url || !url.startsWith('http')) return Promise.resolve(url);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const maxW = 600;
        const maxH = 900;
        let w = img.width;
        let h = img.height;
        if (w > maxW || h > maxH) {
          if (w / h > maxW / maxH) {
            h = Math.round((h * maxW) / w);
            w = maxW;
          } else {
            w = Math.round((w * maxH) / h);
            h = maxH;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const compressed = canvas.toDataURL('image/jpeg', 0.8);
          resolve(compressed);
        } else {
          resolve(url);
        }
      } catch (e) {
        resolve(url);
      }
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
};

export const AddItemModal: React.FC<AddItemModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingItem,
  t,
}) => {
  const [title, setTitle] = useState(editingItem?.title || '');
  const [category, setCategory] = useState(editingItem?.category || 'Фильмы');
  const [status, setStatus] = useState(editingItem?.status || 'completed');
  const [rating, setRating] = useState(editingItem?.rating || 10);
  const [genre, setGenre] = useState(editingItem?.genre || '');

  const [episodesCount, setEpisodesCount] = useState('');
  const [durationMin, setDurationMin] = useState('');

  const [releaseYear, setReleaseYear] = useState(editingItem?.release_year || '');
  const [posterUrl, setPosterUrl] = useState(editingItem?.poster_url || '');
  const [note, setNote] = useState(editingItem?.note || '');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);

  useEffect(() => {
    if (editingItem) {
      setTitle(editingItem.title || '');
      setCategory(editingItem.category || 'Фильмы');
      setStatus(editingItem.status || 'completed');
      setRating(editingItem.rating || 10);
      setGenre(editingItem.genre || '');
      setReleaseYear(editingItem.release_year || '');
      setPosterUrl(editingItem.poster_url || '');
      setNote(editingItem.note || '');

      const durStr = editingItem.duration || '';
      if (durStr.includes('•') || durStr.includes('сер.')) {
        const parts = durStr.split('•');
        setEpisodesCount(parts[0]?.replace(/\D/g, '') || '');
        setDurationMin(parts[1]?.replace(/\D/g, '') || '');
      } else {
        setDurationMin(durStr.replace(/\D/g, ''));
        setEpisodesCount('');
      }
    } else {
      setTitle('');
      setCategory('Фильмы');
      setStatus('completed');
      setRating(10);
      setGenre('');
      setDurationMin('');
      setEpisodesCount('');
      setReleaseYear('');
      setPosterUrl('');
      setNote('');
    }
  }, [editingItem, isOpen]);

  if (!isOpen) return null;

  const isSeries = category === 'Сериалы' || category === 'show' || category === 'series';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsCompressing(true);
    let finalPoster = posterUrl;
    if (posterUrl && posterUrl.startsWith('http')) {
      finalPoster = await compressPosterImage(posterUrl);
    }

    let finalDuration = '';
    if (isSeries) {
      const epStr = episodesCount ? `${episodesCount} ${t.modal.episodes_unit}` : '';
      const minStr = durationMin ? `${durationMin} ${t.modal.minutes_unit}` : '';
      if (epStr && minStr) finalDuration = `${epStr} • ${minStr}`;
      else finalDuration = epStr || minStr;
    } else {
      finalDuration = durationMin ? `${durationMin} ${t.modal.minutes_unit}` : '';
    }

    try {
      await onSave({
        title,
        category,
        status,
        rating,
        genre,
        duration: finalDuration,
        release_year: releaseYear,
        poster_url: finalPoster,
        note,
      });
      setIsCompressing(false);
      onClose();
    } catch (err) {
      console.error('Failed to save item:', err);
      setIsCompressing(false);
    }
  };

  const categories = [
    { label: t.categories.movie_single, value: 'Фильмы' },
    { label: t.categories.show_single, value: 'Сериалы' },
    { label: t.categories.book_single, value: 'Книги' },
    { label: t.categories.audiobook_single, value: 'Аудиокниги' },
    { label: t.categories.podcast_single, value: 'Подкасты' },
    { label: t.categories.game_single, value: 'Игры' },
  ];

  const statuses = [
    { label: t.modal.status_watching, val: 'watching' },
    { label: t.modal.status_completed, val: 'completed' },
    { label: t.modal.status_planned, val: 'planned' },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end">
      <div className="w-full bg-cardDark rounded-t-3xl p-5 space-y-4 border-t border-cardBorder max-w-md mx-auto animate-slide-up max-h-[90vh] overflow-y-auto hide-scrollbar shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-1 border-b border-cardBorder">
          <h3 className="text-base font-bold text-white">
            {editingItem ? t.modal.edit_item : t.modal.add_item}
          </h3>
          <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 1. Category Selector */}
          <div>
            <label className="text-[11px] font-semibold text-gray-400 mb-1.5 block">
              {t.modal.category_label}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {categories.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`p-2.5 rounded-xl border text-xs font-semibold transition ${
                    category === c.value
                      ? 'border-accentViolet bg-accentViolet/15 text-accentViolet shadow-sm'
                      : 'border-cardBorder bg-bgDark text-gray-300 hover:border-gray-600'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Main Title Input */}
          <div>
            <label className="text-[11px] font-semibold text-gray-400 mb-1.5 block">
              {t.modal.title_label}
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t.modal.title_placeholder}
              className="w-full bg-bgDark border border-cardBorder rounded-xl p-3 text-sm text-white focus:outline-none focus:border-accentViolet"
            />
          </div>

          {/* 3. Status Selector */}
          <div>
            <label className="text-[11px] font-semibold text-gray-400 mb-1.5 block">
              {t.modal.status_label}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {statuses.map((st) => (
                <button
                  key={st.val}
                  type="button"
                  onClick={() => setStatus(st.val)}
                  className={`p-2 rounded-xl border text-[11px] font-semibold transition ${
                    status === st.val
                      ? 'border-accentTeal bg-accentTeal/15 text-accentTeal shadow-sm'
                      : 'border-cardBorder bg-bgDark text-gray-300 hover:border-gray-600'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Rating */}
          <div>
            <label className="text-[11px] font-semibold text-gray-400 mb-1.5 flex justify-between">
              <span>{t.modal.rating_label}: {rating}/10</span>
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
              className="w-full accent-accentViolet cursor-pointer"
            />
          </div>

          {/* 5. Toggle additional details */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-accentViolet hover:underline pt-1 block font-medium"
          >
            {showAdvanced ? t.modal.advanced_hide : t.modal.advanced_show}
          </button>

          {showAdvanced && (
            <div className="space-y-3 pt-2 border-t border-cardBorder">
              <div>
                <input
                  type="text"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  placeholder={t.modal.placeholder_genre}
                  className="w-full bg-bgDark border border-cardBorder rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-accentViolet"
                />
              </div>

              {/* Episodes & Duration Inputs */}
              {isSeries ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1">{t.modal.episodes_label}</label>
                    <input
                      type="number"
                      value={episodesCount}
                      onChange={(e) => setEpisodesCount(e.target.value)}
                      placeholder={t.modal.episodes_placeholder}
                      className="w-full bg-bgDark border border-cardBorder rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-accentViolet"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1">{t.modal.duration_min_label}</label>
                    <input
                      type="number"
                      value={durationMin}
                      onChange={(e) => setDurationMin(e.target.value)}
                      placeholder={t.modal.duration_min_placeholder}
                      className="w-full bg-bgDark border border-cardBorder rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-accentViolet"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={durationMin}
                    onChange={(e) => setDurationMin(e.target.value)}
                    placeholder={t.modal.duration_min_placeholder}
                    className="w-full bg-bgDark border border-cardBorder rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-accentViolet"
                  />
                  <input
                    type="text"
                    value={releaseYear}
                    onChange={(e) => setReleaseYear(e.target.value)}
                    placeholder={t.modal.placeholder_year}
                    className="w-full bg-bgDark border border-cardBorder rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-accentViolet"
                  />
                </div>
              )}

              {isSeries && (
                <div>
                  <input
                    type="text"
                    value={releaseYear}
                    onChange={(e) => setReleaseYear(e.target.value)}
                    placeholder={t.modal.placeholder_year}
                    className="w-full bg-bgDark border border-cardBorder rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-accentViolet"
                  />
                </div>
              )}

              <div>
                <input
                  type="url"
                  value={posterUrl}
                  onChange={(e) => setPosterUrl(e.target.value)}
                  placeholder={t.modal.placeholder_poster}
                  className="w-full bg-bgDark border border-cardBorder rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-accentViolet"
                />
              </div>
              <div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder={t.modal.placeholder_note}
                  className="w-full bg-bgDark border border-cardBorder rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-accentViolet"
                />
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isCompressing}
            className="w-full py-3 rounded-xl bg-accentViolet text-white font-bold text-sm shadow-lg shadow-accentViolet/30 mt-2 hover:bg-opacity-90 active:scale-98 transition disabled:opacity-50"
          >
            {isCompressing ? '...' : t.modal.save}
          </button>
        </form>
      </div>
    </div>
  );
};
