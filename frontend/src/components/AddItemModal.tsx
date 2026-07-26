import React, { useState, useEffect } from 'react';
import { X, ChevronDown, Check, Sparkles } from 'lucide-react';
import { Item, CatalogItem } from '../types';
import { Translations, getTranslatedStatus } from '../services/i18n';
import { api } from '../services/api';
import { getNextPlaceholderPoster } from '../services/posters';
import { GENRE_KEYS, getTranslatedGenreFull } from '../services/genres';

interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: Partial<Item>) => void;
  editingItem?: Item | null;
  t: Translations;
}

const compressPosterImage = (url: string): Promise<string> => {
  if (!url || !url.startsWith('http') || url.startsWith('data:image')) {
    return Promise.resolve(url);
  }
  return new Promise((resolve) => {
    let finished = false;
    const safeResolve = (resUrl: string) => {
      if (!finished) {
        finished = true;
        resolve(resUrl);
      }
    };

    const timer = setTimeout(() => {
      safeResolve(url);
    }, 1000);

    try {
      const img = new Image();
      img.onload = () => {
        clearTimeout(timer);
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
            safeResolve(compressed);
          } else {
            safeResolve(url);
          }
        } catch (e) {
          safeResolve(url);
        }
      };
      img.onerror = () => {
        clearTimeout(timer);
        safeResolve(url);
      };
      img.src = url;
    } catch (e) {
      clearTimeout(timer);
      safeResolve(url);
    }
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
  const [youtubeUrl, setYoutubeUrl] = useState(editingItem?.youtube_url || '');
  const [description, setDescription] = useState(editingItem?.description || '');
  const [note, setNote] = useState(editingItem?.note || '');
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isGenreDropdownOpen, setIsGenreDropdownOpen] = useState(false);

  const [catalogSuggestions, setCatalogSuggestions] = useState<CatalogItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (editingItem) {
      setTitle(editingItem.title || '');
      setCategory(editingItem.category || 'Фильмы');
      setStatus(editingItem.status || 'completed');
      setRating(editingItem.rating || 10);
      setGenre(getTranslatedGenreFull(editingItem.genre, t));
      setReleaseYear(editingItem.release_year || '');
      setPosterUrl(editingItem.poster_url || '');
      setYoutubeUrl(editingItem.youtube_url || '');
      setDescription(editingItem.description || '');
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

      setShowAdvanced(true);
    } else {
      setTitle('');
      setCategory('Фильмы');
      setStatus('completed');
      setRating(10);
      setGenre(getTranslatedGenreFull('romance_drama', t));
      setDurationMin('');
      setEpisodesCount('');
      setReleaseYear('');
      setPosterUrl('');
      setYoutubeUrl('');
      setDescription('');
      setNote('');
      setShowAdvanced(true);
    }
  }, [editingItem, isOpen, t]);

  if (!isOpen) return null;

  const isSeries =
    category === 'Сериалы' ||
    category === 'show' ||
    category === 'shows' ||
    category === 'series' ||
    category === 'Серіал';

  const isCategorySelected = (cVal: string) => {
    const cur = (category || '').toLowerCase().trim();
    const target = (cVal || '').toLowerCase().trim();
    if (cur === target) return true;
    if (['movie', 'movies', 'фильмы', 'фильм', 'фільм', 'фільми'].includes(cur) && ['movie', 'movies', 'фильмы', 'фильм', 'фільм', 'фільми'].includes(target)) return true;
    if (['show', 'shows', 'series', 'сериалы', 'сериал', 'серіал', 'серіали'].includes(cur) && ['show', 'shows', 'series', 'сериалы', 'сериал', 'серіал', 'серіали'].includes(target)) return true;
    if (['book', 'books', 'книги', 'книга'].includes(cur) && ['book', 'books', 'книги', 'книга'].includes(target)) return true;
    if (['audiobook', 'audiobooks', 'аудиокниги', 'аудіокниги', 'аудиокнига', 'аудіокнига'].includes(cur) && ['audiobook', 'audiobooks', 'аудиокниги', 'аудіокниги', 'аудиокнига', 'аудіокнига'].includes(target)) return true;
    if (['podcast', 'podcasts', 'подкасты', 'подкасти', 'подкаст'].includes(cur) && ['podcast', 'podcasts', 'подкасты', 'подкасти', 'подкаст'].includes(target)) return true;
    if (['game', 'games', 'игры', 'ігри', 'игра', 'гра'].includes(cur) && ['game', 'games', 'игры', 'ігри', 'игра', 'гра'].includes(target)) return true;
    return false;
  };

  const handleTitleChange = async (val: string) => {
    setTitle(val);
    if (val.trim().length >= 2) {
      try {
        const results = await api.searchCatalog(val, category);
        setCatalogSuggestions(results || []);
        setShowSuggestions(results && results.length > 0);
      } catch (e) {
        setCatalogSuggestions([]);
        setShowSuggestions(false);
      }
    } else {
      setCatalogSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = (sug: CatalogItem) => {
    setTitle(sug.title);
    if (sug.genre) setGenre(sug.genre);
    if (sug.release_year) setReleaseYear(sug.release_year);
    if (sug.poster_url) setPosterUrl(sug.poster_url);
    if (sug.youtube_url) setYoutubeUrl(sug.youtube_url);
    if (sug.description) setDescription(sug.description);
    setShowSuggestions(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsCompressing(true);

    let finalPoster = posterUrl.trim();
    if (finalPoster && finalPoster.startsWith('http')) {
      finalPoster = await compressPosterImage(finalPoster);
    }
    if (!finalPoster && !editingItem) {
      finalPoster = getNextPlaceholderPoster();
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

    const payload: Partial<Item> = {
      title: title.trim(),
      category,
      status,
      rating,
      genre: genre.trim(),
      duration: finalDuration.trim(),
      release_year: releaseYear.trim(),
      poster_url: finalPoster,
      youtube_url: youtubeUrl.trim(),
      description: description.trim(),
      note: note.trim(),
    };

    try {
      await onSave(payload);
    } catch (err) {
      console.error('Failed to save item:', err);
    } finally {
      setIsCompressing(false);
      onClose();
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
    { label: getTranslatedStatus('watching', category, t), val: 'watching' },
    { label: t.modal.status_completed, val: 'completed' },
    { label: t.modal.status_planned, val: 'planned' },
  ];

  const genreOptions = GENRE_KEYS.map((k) => t.genres[k]);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center p-3 pb-8 sm:pb-12">
      <div className="w-full bg-cardDark rounded-3xl p-5 pb-8 space-y-4 border border-cardBorder max-w-md mx-auto animate-slide-up max-h-[85vh] overflow-y-auto hide-scrollbar shadow-2xl mb-4 sm:mb-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-1 border-b border-cardBorder">
          <h3 className="text-base font-bold text-white">
            {editingItem ? t.modal.edit_item : t.modal.add_item}
          </h3>
          <button onClick={onClose} type="button" className="p-1 rounded-full text-gray-400 hover:text-white transition">
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
              {categories.map((c) => {
                const selected = isCategorySelected(c.value);
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategory(c.value)}
                    className={`p-2.5 rounded-xl border text-xs font-semibold transition ${
                      selected
                        ? 'border-accentViolet bg-accentViolet/15 text-accentViolet shadow-sm font-bold'
                        : 'border-cardBorder bg-bgDark text-gray-300 hover:border-gray-600'
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Main Title Input + Autocomplete Suggestions */}
          <div className="relative">
            <label className="text-[11px] font-semibold text-gray-400 mb-1.5 block">
              {t.modal.title_label}
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder={t.modal.title_placeholder}
              className="w-full bg-bgDark border border-cardBorder rounded-xl p-3 text-sm text-white focus:outline-none focus:border-accentViolet"
            />

            {/* Catalog Autocomplete Suggestions Popup */}
            {showSuggestions && catalogSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-cardDark border border-cardBorder rounded-2xl p-2 shadow-2xl z-50 animate-slide-up max-h-52 overflow-y-auto">
                <div className="text-[10px] text-accentTeal font-semibold px-2 py-1 border-b border-cardBorder/60 mb-1 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-accentTeal" />
                  {t.modal.catalog_autofill_hint}
                </div>
                {catalogSuggestions.map((sug, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleSelectSuggestion(sug)}
                    className="p-2 hover:bg-bgDark rounded-xl cursor-pointer flex items-center justify-between transition group"
                  >
                    <div className="flex items-center gap-2">
                      {sug.poster_url ? (
                        <img src={sug.poster_url} className="w-7 h-10 object-cover rounded shadow" alt="" />
                      ) : (
                        <div className="w-7 h-10 bg-gray-800 rounded flex items-center justify-center text-[10px] text-gray-400 font-bold">
                          {sug.category?.[0]?.toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="text-xs font-bold text-white group-hover:text-accentViolet transition">{sug.title}</div>
                        <div className="text-[10px] text-gray-400">
                          {sug.release_year ? `${sug.release_year} г.` : ''} {sug.genre ? `• ${sug.genre}` : ''}
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] bg-accentViolet/20 text-accentViolet font-semibold px-2 py-0.5 rounded-full shrink-0">
                      Автозаполнить
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. Description Input */}
          <div>
            <label className="text-[11px] font-semibold text-gray-400 mb-1.5 block">
              {t.modal.description_label}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder={t.modal.placeholder_description}
              className="w-full bg-bgDark border border-cardBorder rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-accentViolet"
            />
          </div>

          {/* 4. Status Selector */}
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

          {/* 5. Rating */}
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

          {/* 6. Additional details fields */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-accentViolet hover:underline pt-1 block font-medium"
          >
            {showAdvanced ? t.modal.advanced_hide : t.modal.advanced_show}
          </button>

          {showAdvanced && (
            <div className="space-y-3 pt-2 border-t border-cardBorder">
              {/* Custom React Dropdown for Genre */}
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">{t.details.genre}</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsGenreDropdownOpen(!isGenreDropdownOpen)}
                    className="w-full bg-bgDark border border-cardBorder rounded-xl p-2.5 text-xs text-white flex items-center justify-between transition focus:outline-none focus:border-accentViolet hover:border-gray-500 shadow-sm"
                  >
                    <span className="font-semibold text-white truncate">{genre}</span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isGenreDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Dropdown Options Popup */}
                  {isGenreDropdownOpen && (
                    <div className="dropdown-menu-container absolute left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto hide-scrollbar bg-cardDark border border-cardBorder rounded-2xl p-1.5 shadow-2xl space-y-1 z-50 animate-slide-up">
                      {genreOptions.map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => {
                            setGenre(g);
                            setIsGenreDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition flex items-center justify-between ${
                            genre === g
                              ? 'dropdown-option-active bg-accentViolet text-white'
                              : 'dropdown-option-inactive text-gray-300 hover:bg-bgDark'
                          }`}
                        >
                          <span>{g}</span>
                          {genre === g && <Check className="w-3.5 h-3.5 text-white" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1">{t.modal.year_label}</label>
                    <input
                      type="text"
                      value={releaseYear}
                      onChange={(e) => setReleaseYear(e.target.value)}
                      placeholder={t.modal.placeholder_year}
                      className="w-full bg-bgDark border border-cardBorder rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-accentViolet"
                    />
                  </div>
                </div>
              )}

              {isSeries && (
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Год</label>
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
                <label className="text-[10px] text-gray-400 block mb-1">Постер (URL)</label>
                <input
                  type="text"
                  value={posterUrl}
                  onChange={(e) => setPosterUrl(e.target.value)}
                  placeholder={t.modal.placeholder_poster}
                  className="w-full bg-bgDark border border-cardBorder rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-accentViolet"
                />
              </div>

              <div>
                <label className="text-[10px] text-gray-400 block mb-1">{t.modal.youtube_url_label}</label>
                <input
                  type="text"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder={t.modal.placeholder_youtube_url}
                  className="w-full bg-bgDark border border-cardBorder rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-accentViolet"
                />
              </div>

              <div>
                <label className="text-[10px] text-gray-400 block mb-1">{t.details.notes}</label>
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
            className="w-full py-3.5 rounded-xl bg-accentViolet text-white font-bold text-sm shadow-lg shadow-accentViolet/30 mt-4 mb-6 hover:bg-opacity-90 active:scale-98 transition disabled:opacity-50"
          >
            {isCompressing ? 'Сохранение...' : t.modal.save}
          </button>
        </form>
      </div>
    </div>
  );
};
