import React, { useState } from 'react';
import {
  ChevronLeft,
  MoreVertical,
  Star,
  Check,
  Calendar,
  Pencil,
  Bookmark,
  Edit3,
  Share2,
  Trash2,
  ChevronDown
} from 'lucide-react';
import { Item } from '../types';
import { Translations } from '../services/i18n';

interface DetailsScreenProps {
  item: Item;
  onBack: () => void;
  onEdit: (item: Item) => void;
  onDelete: (id: string) => void;
  onUpdateStatus?: (item: Item, newStatus: string) => void;
  t: Translations;
}

const DEFAULT_BANNER_IMAGE = 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80';

export const DetailsScreen: React.FC<DetailsScreenProps> = ({
  item,
  onBack,
  onEdit,
  onDelete,
  onUpdateStatus,
  t,
}) => {
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);

  const ratingStars = Math.min(5, Math.max(1, Math.round((item.rating || 10) / 2)));
  const isCompleted = item.status === 'completed' || item.status === 'Просмотрено';

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
    if (onUpdateStatus) {
      onUpdateStatus(item, newStatusVal);
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
          src={item.poster_url || DEFAULT_BANNER_IMAGE}
          className="w-full h-full object-cover object-center"
          alt={item.title}
          onError={(e) => {
            (e.target as HTMLImageElement).src = DEFAULT_BANNER_IMAGE;
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-bgDark/95 via-bgDark/40 to-transparent"></div>

        <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between z-10">
          <div>
            <h1 className="text-xl font-bold text-white drop-shadow-md line-clamp-1">{item.title}</h1>
            <p className="text-xs text-gray-300 drop-shadow mt-0.5">
              {formatCategorySingle(item.category)} • {item.release_year || '2024'}
            </p>
          </div>

          {/* Interactive Dropdown Status Pill */}
          <div className="relative">
            <button
              onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 shadow-md ${
                isCompleted
                  ? 'bg-accentTeal/20 border-accentTeal/50 text-accentTeal'
                  : 'bg-accentViolet/20 border-accentViolet/50 text-accentViolet'
              }`}
            >
              <span>{getStatusLabel(item.status)}</span>
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <ChevronDown className="w-3 h-3 opacity-70" />
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

      {/* Rating Block */}
      <div className="glass-card p-4 rounded-3xl flex items-center justify-between shadow-sm">
        <div>
          <div className="text-xs text-gray-400 font-medium">{t.details.my_rating}</div>
          <div className="flex items-center gap-1 mt-1 text-amber-400">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star
                key={s}
                className={`w-5 h-5 ${s <= ratingStars ? 'fill-amber-400 text-amber-400' : 'text-gray-600'}`}
              />
            ))}
          </div>
        </div>
        <div className="text-xl font-extrabold text-accentTeal">{item.rating || 10}/10</div>
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

      {/* Notes Section */}
      <div className="glass-card p-4 rounded-3xl space-y-2 shadow-sm">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-400 font-semibold">{t.details.notes}</span>
          <Pencil onClick={() => onEdit(item)} className="w-3.5 h-3.5 text-gray-400 cursor-pointer hover:text-white" />
        </div>
        <p className="text-xs text-gray-300 leading-relaxed italic">
          "{item.note || '-'}"
        </p>
      </div>

      {/* Detail Action Grid */}
      <div className="grid grid-cols-4 gap-2 pt-1">
        <button className="flex flex-col items-center justify-center p-3 rounded-2xl bg-cardDark border border-cardBorder text-gray-300 hover:text-white transition active:scale-95">
          <Bookmark className="w-4 h-4 mb-1" />
          <span className="text-[10px] font-medium">{t.details.add_to_list}</span>
        </button>
        <button
          onClick={() => onEdit(item)}
          className="flex flex-col items-center justify-center p-3 rounded-xl bg-cardDark border border-cardBorder text-gray-300 hover:text-white transition active:scale-95"
        >
          <Edit3 className="w-4 h-4 mb-1" />
          <span className="text-[10px] font-medium">{t.details.edit}</span>
        </button>
        <button className="flex flex-col items-center justify-center p-3 rounded-xl bg-cardDark border border-cardBorder text-gray-300 hover:text-white transition active:scale-95">
          <Share2 className="w-4 h-4 mb-1" />
          <span className="text-[10px] font-medium">{t.details.share}</span>
        </button>
        <button
          onClick={() => onDelete(item.id)}
          className="flex flex-col items-center justify-center p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition active:scale-95"
        >
          <Trash2 className="w-4 h-4 mb-1" />
          <span className="text-[10px] font-medium">{t.details.delete}</span>
        </button>
      </div>
    </div>
  );
};
