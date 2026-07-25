import React, { useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { Item } from '../types';

interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: Partial<Item>) => void;
  editingItem?: Item | null;
}

export const AddItemModal: React.FC<AddItemModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingItem,
}) => {
  const [title, setTitle] = useState(editingItem?.title || '');
  const [category, setCategory] = useState(editingItem?.category || 'Фильмы');
  const [status, setStatus] = useState(editingItem?.status || 'completed');
  const [rating, setRating] = useState(editingItem?.rating || 10);
  const [genre, setGenre] = useState(editingItem?.genre || '');
  const [duration, setDuration] = useState(editingItem?.duration || '');
  const [releaseYear, setReleaseYear] = useState(editingItem?.release_year || '');
  const [posterUrl, setPosterUrl] = useState(editingItem?.poster_url || '');
  const [note, setNote] = useState(editingItem?.note || '');
  const [rawInput, setRawInput] = useState(editingItem?.raw_input || '');
  const [showAdvanced, setShowAdvanced] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      await onSave({
        title,
        category,
        status,
        rating,
        genre,
        duration,
        release_year: releaseYear,
        poster_url: posterUrl,
        note,
        raw_input: rawInput,
      });
      onClose();
    } catch (err) {
      console.error('Failed to save item:', err);
      alert('Не удалось сохранить запись. Проверьте подключение к серверу.');
    }
  };

  const categories = [
    { label: 'Фильм', value: 'Фильмы' },
    { label: 'Сериал', value: 'Сериалы' },
    { label: 'Книга', value: 'Книги' },
    { label: 'Аудиокнига', value: 'Аудиокниги' },
    { label: 'Подкаст', value: 'Подкасты' },
    { label: 'Игра', value: 'Игры' },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end">
      <div className="w-full bg-cardDark rounded-t-3xl p-5 space-y-4 border-t border-cardBorder max-w-md mx-auto animate-slide-up max-h-[90vh] overflow-y-auto hide-scrollbar">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">
            {editingItem ? 'Редактировать запись' : 'Добавить запись'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Main Title */}
          <div>
            <label className="text-[11px] text-gray-400 mb-1 block">Название</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Название (например, Дюна 2)"
              className="w-full bg-bgDark border border-cardBorder rounded-xl p-3 text-sm text-white focus:outline-none focus:border-accentViolet"
            />
          </div>

          {/* Category Selector */}
          <div>
            <label className="text-[11px] text-gray-400 mb-1 block">Категория</label>
            <div className="grid grid-cols-3 gap-2">
              {categories.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`p-2.5 rounded-xl border text-xs font-medium transition ${
                    category === c.value
                      ? 'border-accentViolet bg-accentViolet/10 text-accentViolet'
                      : 'border-cardBorder bg-bgDark text-gray-300'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Status Selector */}
          <div>
            <label className="text-[11px] text-gray-400 mb-1 block">Статус</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Смотрю/Читаю', val: 'watching' },
                { label: 'Завершено', val: 'completed' },
                { label: 'В планах', val: 'planned' },
              ].map((st) => (
                <button
                  key={st.val}
                  type="button"
                  onClick={() => setStatus(st.val)}
                  className={`p-2 rounded-xl border text-[11px] font-medium transition ${
                    status === st.val
                      ? 'border-accentTeal bg-accentTeal/10 text-accentTeal'
                      : 'border-cardBorder bg-bgDark text-gray-300'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rating */}
          <div>
            <label className="text-[11px] text-gray-400 mb-1 flex justify-between">
              <span>Оценка: {rating}/10</span>
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

          {/* AI Quick Description Field (Preparing for future LLM integration) */}
          <div>
            <label className="text-[11px] text-accentTeal font-medium mb-1 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> Быстрое описание (для AI)
            </label>
            <textarea
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              rows={2}
              placeholder="Введите описание своими словами, ИИ заполнит детали в будущем..."
              className="w-full bg-bgDark border border-cardBorder rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-accentTeal"
            />
          </div>

          {/* Toggle additional details */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-accentViolet hover:underline pt-1 block"
          >
            {showAdvanced ? 'Скрыть дополнительные поля' : '+ Добавить жанр, год, постер и заметки'}
          </button>

          {showAdvanced && (
            <div className="space-y-3 pt-1 border-t border-cardBorder">
              <div>
                <input
                  type="text"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  placeholder="Жанр (например, Фантастика, Драма)"
                  className="w-full bg-bgDark border border-cardBorder rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-accentViolet"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="Длительность (2ч 30м / 1 season)"
                  className="w-full bg-bgDark border border-cardBorder rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-accentViolet"
                />
                <input
                  type="text"
                  value={releaseYear}
                  onChange={(e) => setReleaseYear(e.target.value)}
                  placeholder="Год вып. (2024)"
                  className="w-full bg-bgDark border border-cardBorder rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-accentViolet"
                />
              </div>
              <div>
                <input
                  type="url"
                  value={posterUrl}
                  onChange={(e) => setPosterUrl(e.target.value)}
                  placeholder="Ссылка на обложку (Poster Image URL)"
                  className="w-full bg-bgDark border border-cardBorder rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-accentViolet"
                />
              </div>
              <div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Заметка или впечатления..."
                  className="w-full bg-bgDark border border-cardBorder rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-accentViolet"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-accentViolet text-white font-bold text-sm shadow-lg shadow-accentViolet/30 mt-2 hover:bg-opacity-90 active:scale-98 transition"
          >
            Сохранить
          </button>
        </form>
      </div>
    </div>
  );
};
