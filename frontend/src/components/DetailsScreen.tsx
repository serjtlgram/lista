import React from 'react';
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
  Sparkles
} from 'lucide-react';
import { Item } from '../types';

interface DetailsScreenProps {
  item: Item;
  onBack: () => void;
  onEdit: (item: Item) => void;
  onDelete: (id: string) => void;
}

export const DetailsScreen: React.FC<DetailsScreenProps> = ({
  item,
  onBack,
  onEdit,
  onDelete,
}) => {
  const ratingStars = Math.min(5, Math.max(1, Math.round((item.rating || 10) / 2)));
  const isCompleted = item.status === 'completed' || item.status === 'Просмотрено';

  const formatCategory = (cat: string) => {
    switch (cat?.toLowerCase()) {
      case 'movie': case 'фильмы': return 'Фильм';
      case 'show': case 'shows': case 'series': case 'сериалы': return 'Сериал';
      case 'book': case 'книги': return 'Книга';
      case 'audiobook': case 'аудиокниги': return 'Аудиокнига';
      case 'podcast': case 'подкасты': return 'Подкаст';
      case 'game': case 'игры': return 'Игра';
      default: return cat;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Nav */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="p-2 text-gray-300 hover:text-white">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <MoreVertical className="w-5 h-5 text-gray-300 cursor-pointer" />
      </div>

      {/* Main Poster Banner */}
      <div className="relative w-full h-52 rounded-2xl overflow-hidden glass-card">
        <img
          src={item.poster_url || 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80'}
          className="w-full h-full object-cover"
          alt={item.title}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-bgDark via-transparent to-transparent"></div>

        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
          <div>
            <h1 className="text-xl font-bold text-white drop-shadow">{item.title}</h1>
            <p className="text-xs text-gray-300 drop-shadow">
              {formatCategory(item.category)} • {item.release_year || '2024'}
            </p>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-teal-500/20 border border-teal-500/40 text-accentTeal text-xs font-semibold flex items-center gap-1.5">
            {isCompleted ? 'Просмотрено' : item.status} <Check className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* Rating Block */}
      <div className="glass-card p-4 rounded-2xl flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-400">Моя оценка</div>
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

      {/* Meta info list */}
      <div className="glass-card p-4 rounded-2xl space-y-3 text-xs">
        <div className="flex justify-between items-center pb-2 border-b border-cardBorder">
          <span className="text-gray-400">Дата просмотра</span>
          <span className="font-medium text-white flex items-center gap-1">
            {item.completed_at ? new Date(item.completed_at).toLocaleDateString('ru-RU') : '12 мая 2024'}{' '}
            <Calendar className="w-3.5 h-3.5 text-gray-400" />
          </span>
        </div>
        <div className="flex justify-between items-center pb-2 border-b border-cardBorder">
          <span className="text-gray-400">Жанр</span>
          <span className="font-medium text-white">{item.genre || 'Фантастика, Драма'}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-400">Длительность</span>
          <span className="font-medium text-white">{item.duration || '2ч 46м'}</span>
        </div>
      </div>

      {/* Raw input / AI Prep Field */}
      {item.raw_input && (
        <div className="glass-card p-4 rounded-2xl space-y-2 border border-accentTeal/30">
          <div className="flex items-center gap-1.5 text-xs text-accentTeal font-semibold">
            <Sparkles className="w-4 h-4" /> Контекст для AI
          </div>
          <p className="text-xs text-gray-300 italic">{item.raw_input}</p>
        </div>
      )}

      {/* Notes Section */}
      <div className="glass-card p-4 rounded-2xl space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-400 font-medium">Заметки</span>
          <Pencil onClick={() => onEdit(item)} className="w-3.5 h-3.5 text-gray-400 cursor-pointer hover:text-white" />
        </div>
        <p className="text-xs text-gray-300 leading-relaxed italic">
          "{item.note || 'Потрясающая визуальная часть и музыка. Особенно впечатлили ключевые сцены.'}"
        </p>
      </div>

      {/* Detail Action Grid */}
      <div className="grid grid-cols-4 gap-2 pt-2">
        <button className="flex flex-col items-center justify-center p-3 rounded-xl bg-cardDark border border-cardBorder text-gray-300 hover:text-white transition">
          <Bookmark className="w-4 h-4 mb-1" />
          <span className="text-[10px]">В список</span>
        </button>
        <button
          onClick={() => onEdit(item)}
          className="flex flex-col items-center justify-center p-3 rounded-xl bg-cardDark border border-cardBorder text-gray-300 hover:text-white transition"
        >
          <Edit3 className="w-4 h-4 mb-1" />
          <span className="text-[10px]">Изменить</span>
        </button>
        <button className="flex flex-col items-center justify-center p-3 rounded-xl bg-cardDark border border-cardBorder text-gray-300 hover:text-white transition">
          <Share2 className="w-4 h-4 mb-1" />
          <span className="text-[10px]">Поделиться</span>
        </button>
        <button
          onClick={() => onDelete(item.id)}
          className="flex flex-col items-center justify-center p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition"
        >
          <Trash2 className="w-4 h-4 mb-1" />
          <span className="text-[10px]">Удалить</span>
        </button>
      </div>
    </div>
  );
};
