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
  X
} from 'lucide-react';
import { Item } from '../types';
import { Translations } from '../services/i18n';
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

  useEffect(() => {
    setNoteText(item.note || '');
    setIsEditingNote(false);
  }, [item]);

  const currentRating = item.rating || 10;
  const isCompleted = item.status === 'completed' || item.status === 'Просмотрено';

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

  const getStatusLabel = (st: string) => {
    switch (st?.toLowerCase()) {
      case 'completed': case 'просмотрено': return t.modal.status_completed;
      case 'watching': case 'смотрю': return t.modal.status_watching;
      case 'planned': case 'в планах': case 'отложено': return t.modal.status_planned;
      default: return st;
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
        <MoreVertical className="w-5 h-5 text-gray-300 cursor-pointer hover:text-white" />
      </div>

      {/* Main Poster Banner */}
      <div className="relative w-full h-56 rounded-3xl overflow-hidden glass-card shadow-xl">
        <img
          src={posterSrc}
          className="w-full h-full object-cover object-center"
          alt={item.title}
          onError={(e) => {
            (e.target as HTMLImageElement).src = bannerDefault;
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent"></div>

        <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between z-10">
          <div className="banner-text-content">
            <h1 className="text-xl font-bold text-white drop-shadow-md line-clamp-1" style={{ color: '#FFFFFF' }}>
              {item.title}
            </h1>
            <p className="text-xs text-gray-200 drop-shadow mt-0.5" style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
              {formatCategorySingle(item.category)} • {item.release_year || '2024'}
            </p>
          </div>

          {/* High Contrast Dropdown Status Pill over Banner */}
          <div className="relative">
            <button
              onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
              className="status-pill-banner px-3.5 py-1.5 rounded-xl bg-black/75 backdrop-blur-md border border-white/30 text-white text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow-xl hover:border-accentViolet"
              style={{ color: '#FFFFFF' }}
            >
              <span className="font-bold text-white" style={{ color: '#FFFFFF' }}>{getStatusLabel(item.status)}</span>
              <Check className="w-3.5 h-3.5 text-accentTeal stroke-[3]" />
              <ChevronDown className="w-3.5 h-3.5 text-white/80" />
            </button>

            {/* Dropdown Options */}
            {isStatusDropdownOpen && (
              <div className="absolute right-0 bottom-full mb-2 w-44 bg-cardDark border border-cardBorder rounded-2xl p-1.5 shadow-2xl space-y-1 z-30 animate-slide-up">
                {statusOptions.map((opt) => (
                  <button
                    key={opt.val}
                    onClick={() => handleSelectStatus(opt.val)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition flex items-center justify-between ${
                      item.status === opt.val
                        ? 'bg-accentViolet text-white'
                        : 'text-gray-300 hover:bg-bgDark hover:text-white'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {item.status === opt.val && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            )}
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

      {/* Meta Info Card */}
      <div className="glass-card p-4 rounded-3xl space-y-3 text-xs shadow-sm">
        <div className="flex justify-between items-center pb-2 border-b border-cardBorder">
          <span className="text-gray-400">{t.details.watch_date}</span>
          <span className="font-semibold text-white flex items-center gap-1">
            {item.completed_at ? new Date(item.completed_at).toLocaleDateString() : '2024'}
            <Calendar className="w-3.5 h-3.5 text-gray-400" />
          </span>
        </div>
        <div className="flex justify-between items-center pb-2 border-b border-cardBorder">
          <span className="text-gray-400">{t.details.genre}</span>
          <span className="font-semibold text-white">{item.genre || '-'}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-400">{t.details.duration}</span>
          <span className="font-semibold text-white">{item.duration || '-'}</span>
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
    </div>
  );
};
