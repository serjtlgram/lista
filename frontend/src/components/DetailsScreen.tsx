import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  MoreVertical,
  Star,
  Check,
  Calendar,
  Pencil,
  Edit3,
  Share2,
  Trash2,
  ChevronDown,
  Save,
  X,
  Clock,
  Tag
} from 'lucide-react';
import { Item } from '../types';
import { Translations, getTranslatedStatus } from '../services/i18n';
import bannerDefault from '../assets/banner_default.png';

interface DetailsScreenProps {
  item: Item;
  onBack: () => void;
  onEdit: (item: Item) => void;
  onDelete: (id: string) => void;
  onUpdateItem?: (id: string, updates: Partial<Item>) => void;
  t: Translations;
}

export const DetailsScreen: React.FC<DetailsScreenProps> = ({
  item,
  onBack,
  onEdit,
  onDelete,
  onUpdateItem,
  t,
}) => {
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteText, setNoteText] = useState(item.note || '');
  const [isFullscreenPoster, setIsFullscreenPoster] = useState(false);

  useEffect(() => {
    setNoteText(item.note || '');
    setIsEditingNote(false);
  }, [item]);

  const currentRating = item.rating || 10;
  const isDummyOrEmpty = !item.poster_url || item.poster_url.includes('unsplash.com');
  const posterSrc = isDummyOrEmpty ? bannerDefault : item.poster_url;

  const formatCategorySingle = (cat: string) => {
    switch (cat?.toLowerCase()) {
      case 'movie': case 'фильмы': return t.categories.movie_single;
      case 'show': case 'shows': case 'series': case 'сериалы': return t.categories.show_single;
      case 'book': case 'книги': return t.categories.book_single;
      case 'audiobook': case 'аудиокниги': return t.categories.audiobook_single;
      case 'podcast': case 'подкасты': return t.categories.podcast_single;
      case 'game': case 'игры': return t.categories.game_single;
      default: return cat;
    }
  };

  const statusOptions = [
    { val: 'watching', label: t.modal.status_watching },
    { val: 'completed', label: t.modal.status_completed },
    { val: 'planned', label: t.modal.status_planned },
  ];

  const handleSelectStatus = (newStatusVal: string) => {
    setIsStatusDropdownOpen(false);
    if (onUpdateItem) {
      onUpdateItem(item.id, { status: newStatusVal });
    }
  };

  const handleSelectRating = (newRating: number) => {
    if (onUpdateItem) {
      onUpdateItem(item.id, { rating: newRating });
    }
  };

  const handleSaveNote = () => {
    setIsEditingNote(false);
    if (onUpdateItem) {
      onUpdateItem(item.id, { note: noteText });
    }
  };

  const handleShareTelegram = () => {
    const text = `📌 TrackList: ${item.title} (${formatCategorySingle(item.category)})\n⭐ ${t.details.my_rating}: ${currentRating}/10`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent('https://manytgbot.github.io')}&text=${encodeURIComponent(text)}`;
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(shareUrl);
    } else {
      window.open(shareUrl, '_blank');
    }
  };

  return (
    <div className="space-y-4 animate-slide-up pb-6">
      {/* Header Nav */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="p-2 text-gray-300 hover:text-white">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-base font-bold text-white line-clamp-1 max-w-[220px] text-center">
          {item.title}
        </h1>
        <MoreVertical className="w-5 h-5 text-gray-300 cursor-pointer hover:text-white" />
      </div>

      {/* Main Poster & Details Card (2:3 Aspect Ratio Layout) */}
      <div className="glass-card p-4 rounded-3xl space-y-3 shadow-xl">
        <div className="flex gap-4 items-start">
          {/* Left: Vertical Poster Image (2:3 Aspect Ratio) */}
          <div className="relative shrink-0 w-32 aspect-[2/3] rounded-2xl overflow-hidden shadow-lg border border-cardBorder group cursor-pointer">
            <img
              src={posterSrc}
              onClick={() => setIsFullscreenPoster(true)}
              className="w-full h-full object-cover object-center group-hover:scale-105 transition duration-300"
              alt={item.title}
              onError={(e) => {
                (e.target as HTMLImageElement).src = bannerDefault;
              }}
            />
          </div>

          {/* Right: Meta Details (Year, Watch date, Genre, Duration, Status) */}
          <div className="flex-1 space-y-2 text-xs pt-0.5">
            <div>
              <span className="text-gray-400 block text-[10px] uppercase tracking-wider font-semibold">
                {formatCategorySingle(item.category)}
              </span>
              <span className="text-sm font-bold text-white">{item.release_year ? `${item.release_year} г.` : '2024 г.'}</span>
            </div>

            <div className="space-y-1.5 pt-1 border-t border-cardBorder/60">
              <div className="flex items-center justify-between text-gray-300 gap-1">
                <span className="text-gray-400 flex items-center gap-1 shrink-0">
                  <Calendar className="w-3.5 h-3.5 text-accentViolet" />
                  {t.details.watch_date}
                </span>
                <span className="font-semibold text-white text-right">
                  {item.completed_at ? new Date(item.completed_at).toLocaleDateString() : (item.release_year || '2024')}
                </span>
              </div>

              <div className="flex items-center justify-between text-gray-300 gap-1">
                <span className="text-gray-400 flex items-center gap-1 shrink-0">
                  <Tag className="w-3.5 h-3.5 text-accentTeal" />
                  {t.details.genre}
                </span>
                <span className="font-semibold text-white text-right leading-tight">{item.genre || '-'}</span>
              </div>

              <div className="flex items-center justify-between text-gray-300 gap-1">
                <span className="text-gray-400 flex items-center gap-1 shrink-0">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  {t.details.duration}
                </span>
                <span className="font-semibold text-white text-right leading-tight">{item.duration || '-'}</span>
              </div>
            </div>

            {/* Interactive Status Pill Button */}
            <div className="relative pt-1.5">
              <button
                onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                className="w-full px-3 py-2 rounded-xl bg-cardDark border border-cardBorder text-white text-xs font-bold flex items-center justify-between transition active:scale-95 shadow-md hover:border-accentViolet"
              >
                <span className="font-bold text-white truncate">{getTranslatedStatus(item.status, t)}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <Check className="w-3.5 h-3.5 text-accentTeal stroke-[3]" />
                  <ChevronDown className="w-3.5 h-3.5 text-white/80" />
                </div>
              </button>

              {/* Dropdown Options */}
              {isStatusDropdownOpen && (
                <div className="dropdown-menu-container absolute right-0 top-full mt-1 w-full bg-cardDark border border-cardBorder rounded-2xl p-1.5 shadow-2xl space-y-1 z-30 animate-slide-up">
                  {statusOptions.map((opt) => {
                    const isSelected = item.status === opt.val || getTranslatedStatus(item.status, t) === opt.label;
                    return (
                      <button
                        key={opt.val}
                        onClick={() => handleSelectStatus(opt.val)}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition flex items-center justify-between ${
                          isSelected
                            ? 'dropdown-option-active bg-accentViolet text-white'
                            : 'dropdown-option-inactive text-gray-300 hover:bg-bgDark'
                        }`}
                      >
                        <span>{opt.label}</span>
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 10-Star Interactive Rating Block */}
      <div className="glass-card p-4 rounded-3xl space-y-2 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-400 font-semibold">{t.details.my_rating}</div>
          <div className="text-xl font-extrabold text-accentTeal">{currentRating}/10</div>
        </div>

        {/* 10 Interactive Stars */}
        <div className="flex items-center justify-between pt-1">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((starNum) => (
            <button
              key={starNum}
              onClick={() => handleSelectRating(starNum)}
              className="p-0.5 hover:scale-125 transition active:scale-95"
              title={`${starNum}/10`}
            >
              <Star
                className={`w-5 h-5 ${
                  starNum <= currentRating
                    ? 'fill-amber-400 text-amber-400'
                    : 'text-gray-600 hover:text-amber-300'
                }`}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Inline Notes Section */}
      <div className="glass-card p-4 rounded-3xl space-y-2 shadow-sm">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-400 font-semibold">{t.details.notes}</span>
          {!isEditingNote && (
            <button
              onClick={() => setIsEditingNote(true)}
              className="p-1 text-gray-400 hover:text-accentViolet transition"
              title={t.details.edit}
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
        </div>

        {isEditingNote ? (
          <div className="space-y-2 pt-1">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={3}
              placeholder={t.modal.placeholder_note}
              className="w-full bg-bgDark border border-cardBorder rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-accentViolet"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setNoteText(item.note || '');
                  setIsEditingNote(false);
                }}
                className="px-3 py-1.5 rounded-xl border border-cardBorder text-gray-300 text-xs font-medium flex items-center gap-1 hover:bg-bgDark"
              >
                <X className="w-3.5 h-3.5" />
                <span>{t.modal.cancel}</span>
              </button>
              <button
                onClick={handleSaveNote}
                className="px-3 py-1.5 rounded-xl bg-accentViolet text-white text-xs font-semibold flex items-center gap-1 shadow-md hover:bg-opacity-90"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{t.modal.save}</span>
              </button>
            </div>
          </div>
        ) : (
          <p
            onClick={() => setIsEditingNote(true)}
            className="text-xs text-gray-300 leading-relaxed italic cursor-pointer hover:text-white transition"
          >
            "{item.note || '-'}"
          </p>
        )}
      </div>

      {/* 3-Column Detail Action Grid */}
      <div className="grid grid-cols-3 gap-2.5 pt-1">
        <button
          onClick={() => onEdit(item)}
          className="flex flex-col items-center justify-center p-3 rounded-2xl bg-cardDark border border-cardBorder text-gray-300 hover:text-white transition active:scale-95 shadow-sm"
        >
          <Edit3 className="w-4 h-4 mb-1 text-accentViolet" />
          <span className="text-[11px] font-semibold">{t.details.edit}</span>
        </button>
        <button
          onClick={handleShareTelegram}
          className="flex flex-col items-center justify-center p-3 rounded-2xl bg-cardDark border border-cardBorder text-gray-300 hover:text-white transition active:scale-95 shadow-sm"
        >
          <Share2 className="w-4 h-4 mb-1 text-accentTeal" />
          <span className="text-[11px] font-semibold">{t.details.share}</span>
        </button>
        <button
          onClick={() => onDelete(item.id)}
          className="flex flex-col items-center justify-center p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition active:scale-95 shadow-sm"
        >
          <Trash2 className="w-4 h-4 mb-1" />
          <span className="text-[11px] font-semibold">{t.details.delete}</span>
        </button>
      </div>

      {/* Fullscreen Poster Lightbox Modal */}
      {isFullscreenPoster && (
        <div
          onClick={() => setIsFullscreenPoster(false)}
          className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in cursor-pointer"
        >
          <button
            onClick={() => setIsFullscreenPoster(false)}
            className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/40 z-50 transition active:scale-90"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={posterSrc}
            className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
            alt={item.title}
          />
        </div>
      )}
    </div>
  );
};
