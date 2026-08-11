import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
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
  Tag,
  Tv,
  PlusCircle,
  Youtube,
  ExternalLink,
  Maximize2,
  User,
  Users,
  Video,
  FolderPlus,
  Copy,
  Popcorn,
  BookMarked,
  Plus,
  Wand2
} from 'lucide-react';
import { Item } from '../types';
import { Translations, getTranslatedStatus } from '../services/i18n';
import { getItemPoster, getNextPlaceholderPoster } from '../services/posters';
import { getTranslatedGenreFull } from '../services/genres';
import { getTranslatedGenreShort } from '../services/genres';
import { api } from '../services/api';
import { isFavorite, toggleFavorite, getFavoriteIds } from '../services/favorites';
import { getLists, FAVORITES_ID, UserList } from '../services/lists';
import { ListSelectionModal } from './ListSelectionModal';
import { CountryFlag } from './CountryFlag';

const getYouTubeEmbedUrl = (url?: string, autoplay = false): string | null => {
  if (!url) return null;
  try {
    let baseEmbed = '';
    if (url.includes('youtube.com/embed/')) {
      baseEmbed = url;
    } else if (url.includes('playlist?list=')) {
      const listId = url.split('playlist?list=')[1]?.split('&')[0];
      baseEmbed = listId ? `https://www.youtube.com/embed/videoseries?list=${listId}` : '';
    } else {
      let videoId = '';
      if (url.includes('watch?v=')) {
        videoId = url.split('watch?v=')[1]?.split('&')[0] || '';
      } else if (url.includes('youtu.be/')) {
        videoId = url.split('youtu.be/')[1]?.split('?')[0] || '';
      }
      baseEmbed = videoId ? `https://www.youtube.com/embed/${videoId}` : '';
    }
    if (!baseEmbed) return null;

    const sep = baseEmbed.includes('?') ? '&' : '?';
    let result = `${baseEmbed}${sep}rel=0&enablejsapi=1`;
    if (autoplay) {
      result += '&autoplay=1';
    }
    return result;
  } catch {
    return null;
  }
};

const renderTextWithLinks = (text: string) => {
  const linkRegex = /(https?:\/\/[^\s]+|@[a-zA-Z0-9_]+)/g;
  const parts = text.split(linkRegex);
  return parts.map((part, i) => {
    if (part.match(linkRegex)) {
      const isTgMention = part.startsWith('@');
      const href = isTgMention ? `https://t.me/${part.slice(1)}` : part;

      const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
        e.preventDefault();
        e.stopPropagation();
        
        const tg = (window as any).Telegram?.WebApp;
        const isTgUrl = href.startsWith('https://t.me/') || href.startsWith('tg://');

        if (isTgUrl && tg?.openTelegramLink) {
          try {
            tg.openTelegramLink(href);
            return;
          } catch (err) {
            console.warn('openTelegramLink error:', err);
          }
        }
        
        if (tg?.openLink) {
          try {
            tg.openLink(href);
            return;
          } catch (err) {
            console.warn('openLink error:', err);
          }
        }
        
        window.open(href, '_blank');
      };

      return (
        <a 
          key={i} 
          href={href} 
          target="_blank" 
          rel="nofollow noopener noreferrer"
          className="text-accentTeal hover:underline break-all"
          onClick={handleClick}
        >
          {part}
        </a>
      );
    }
    return part;
  });
};

interface Episode {
  s: number;
  e: number;
  title: string;
  air_date: string;
  overview: string;
  runtime: number;
}

const EpisodesAccordion: React.FC<{ episodes: Episode[] }> = ({ episodes }) => {
  const [openSeason, setOpenSeason] = useState<number | null>(null);

  // Group by season
  const seasons: Record<number, Episode[]> = {};
  episodes.forEach(ep => {
    if (!seasons[ep.s]) seasons[ep.s] = [];
    seasons[ep.s].push(ep);
  });
  const seasonNumbers = Object.keys(seasons).map(Number).sort((a, b) => a - b);

  return (
    <div className="space-y-1.5">
      <div className="text-xs text-gray-400 font-semibold mb-2">Эпизоды</div>
      {seasonNumbers.map(sNum => {
        const isOpen = openSeason === sNum;
        const eps = seasons[sNum];
        return (
          <div key={sNum} className="rounded-xl overflow-hidden border border-cardBorder/60">
            <button
              type="button"
              onClick={() => setOpenSeason(isOpen ? null : sNum)}
              className="w-full flex items-center justify-between px-3 py-2 bg-bgDark/50 text-xs font-semibold text-white hover:bg-bgDark/80 transition"
            >
              <span>Сезон {sNum}</span>
              <span className="text-gray-400 flex items-center gap-1">
                <span>{eps.length} эп.</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </span>
            </button>
            {isOpen && (
              <div className="divide-y divide-cardBorder/30 bg-bgDark/30">
                {eps.map(ep => (
                  <div key={ep.e} className="px-3 py-2.5 space-y-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[11px] font-semibold text-white leading-snug flex-1">
                        <span className="text-gray-500 mr-1">{ep.e}.</span>{ep.title}
                      </span>
                      {ep.runtime > 0 && (
                        <span className="text-[10px] text-gray-500 shrink-0 font-mono">{ep.runtime}м</span>
                      )}
                    </div>
                    {ep.air_date && (
                      <div className="text-[10px] text-gray-500">{ep.air_date}</div>
                    )}
                    {ep.overview && (
                      <p className="text-[11px] text-gray-400 leading-relaxed line-clamp-2">{ep.overview}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

interface DetailsScreenProps {

  item: Item;
  onBack: () => void;
  onEdit: (item: Item) => void;
  onDelete: (id: string) => void;
  onUpdateItem?: (id: string, updates: Partial<Item>) => void;
  onAddSharedItem?: (item: Item) => void;
  onAiAction?: (item: Item) => void;
  isSharedPreview?: boolean;
  t: Translations;
}

export const DetailsScreen: React.FC<DetailsScreenProps> = ({
  item,
  onBack,
  onEdit,
  onDelete,
  onUpdateItem,
  onAddSharedItem,
  onAiAction,
  isSharedPreview = false,
  t,
}) => {
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteText, setNoteText] = useState(item.note || '');
  const [isFullscreenPoster, setIsFullscreenPoster] = useState(false);
  const [isFullscreenVideo, setIsFullscreenVideo] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSearchingYoutube, setIsSearchingYoutube] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isFav, setIsFav] = useState<boolean>(() => isFavorite(item.id));
  const [showSharedPreviewModal, setShowSharedPreviewModal] = useState(false);
  const [assignedLists, setAssignedLists] = useState<UserList[]>([]);
  const [isEnriching, setIsEnriching] = useState(false);

  const refreshAssignedLists = () => {
    const allLists = getLists();
    const favIds = getFavoriteIds();
    const matches: UserList[] = [];

    if (favIds.includes(item.id)) {
      const favList = allLists.find((l) => l.id === FAVORITES_ID) || {
        id: FAVORITES_ID,
        name: t.lists?.favorites || 'Избранное',
        isDefault: true,
        itemIds: [],
        createdAt: '',
      };
      matches.push(favList);
    }

    allLists.forEach((l) => {
      if (!l.isDefault && l.itemIds.includes(item.id)) {
        matches.push(l);
      }
    });

    setAssignedLists(matches);
  };

  useEffect(() => {
    refreshAssignedLists();
    const handleUpdate = () => refreshAssignedLists();
    window.addEventListener('lista_lists_updated', handleUpdate);
    window.addEventListener('lista_favorites_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('lista_lists_updated', handleUpdate);
      window.removeEventListener('lista_favorites_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [item.id]);

  useEffect(() => {
    setIsFav(isFavorite(item.id));
  }, [item.id]);

  const handleProtectedAction = (action: () => void) => {
    if (isSharedPreview) {
      setShowSharedPreviewModal(true);
      return;
    }
    action();
  };

  const handleToggleFav = () => {
    const updated = toggleFavorite(item.id);
    setIsFav(updated);
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.impactOccurred('medium');
    }
    setToastMessage(
      updated
        ? t.favorites?.added || 'Добавлено в избранное'
        : t.favorites?.removed || 'Убрано из избранного'
    );
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [item.id]);

  // Handle Telegram WebApp native BackButton when fullscreen video is active
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.BackButton) {
      const handleBack = () => {
        setIsFullscreenVideo(false);
      };
      if (isFullscreenVideo) {
        tg.BackButton.onClick(handleBack);
        tg.BackButton.show();
      } else {
        tg.BackButton.hide();
        tg.BackButton.offClick(handleBack);
      }
      return () => {
        tg.BackButton.offClick(handleBack);
      };
    }
  }, [isFullscreenVideo]);

  // Automatic YouTube search fallback on details view if youtube_url is missing
  useEffect(() => {
    const catLower = (item.category || '').toLowerCase();
    const isMovieOrShow =
      catLower.includes('movie') ||
      catLower.includes('show') ||
      catLower.includes('series') ||
      catLower.includes('фильм') ||
      catLower.includes('сериал');
    const isBook = catLower.includes('book') || catLower.includes('книг');

    if ((isMovieOrShow || isBook) && !item.youtube_url && !isSearchingYoutube && onUpdateItem) {
      setIsSearchingYoutube(true);
      const queryTitle = item.author ? `${item.title} ${item.author}` : item.title;
      api
        .searchYouTube(queryTitle, item.category)
        .then((ytUrl) => {
          if (ytUrl) {
            onUpdateItem(item.id, { youtube_url: ytUrl });
          }
        })
        .finally(() => {
          setIsSearchingYoutube(false);
        });
    }
  }, [item.id, item.title, item.category, item.author, item.youtube_url]);

  const enrichedItemIds = useRef<Set<string>>(new Set());

  // Automatic background metadata enrichment on opening details view
  useEffect(() => {
    const isBook = ['book', 'books', 'книги', 'книга'].includes((item.category || '').toLowerCase().trim());
    const isMissingData = !item.public_rating || !item.description || !item.country || (isBook && (!item.author || !item.isbn || !item.duration || !item.genre));

    if (isMissingData && onUpdateItem && !enrichedItemIds.current.has(item.id)) {
      enrichedItemIds.current.add(item.id);
      api
        .searchCatalog(item.title, item.category)
        .then((results) => {
          if (results && results.length > 0) {
            const match = results.find(r => r.public_rating || r.author || r.isbn) || results[0];
            if (match) {
              const updates: Partial<Item> = {};
              if (!item.public_rating && match.public_rating) updates.public_rating = match.public_rating;
              if (!item.description && match.description) updates.description = match.description;
              if (!item.poster_url && match.poster_url) updates.poster_url = match.poster_url;
              if (!item.genre && match.genre) updates.genre = getTranslatedGenreFull(match.genre, t, item.category);
              if (!item.release_year && match.release_year) updates.release_year = match.release_year;
              if (!item.country && (match as any).country) updates.country = (match as any).country;

              if (isBook) {
                if (!item.author && match.author) updates.author = match.author;
                if (!item.isbn && match.isbn) updates.isbn = match.isbn;
                if (!item.duration && match.duration) {
                  const digits = match.duration.replace(/\D/g, '');
                  if (digits) updates.duration = `${digits} стр.`;
                }
              }

              if (Object.keys(updates).length > 0) {
                onUpdateItem(item.id, updates);
              }
            }
          }
        })
        .catch(() => {});
    }
  }, [item.id, item.title, item.category, item.public_rating, item.description, item.author, item.isbn, item.duration, item.genre, item.country]);

  const [isListModalOpen, setIsListModalOpen] = useState(false);

  useEffect(() => {
    setNoteText(item.note || '');
    setIsEditingNote(false);
  }, [item]);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const currentRating = item.rating || 10;
  const posterSrc = getItemPoster(item);

  const isPlanned =
    item.status === 'planned' ||
    item.status === 'в планах' ||
    item.status === 'у планах' ||
    item.status === 'отложено';

  const formatCategorySingle = (cat: string) => {
    switch (cat?.toLowerCase()) {
      case 'movie': case 'фильмы': case 'фильм': return t.categories.movie_single;
      case 'show': case 'shows': case 'series': case 'сериалы': case 'сериал': return t.categories.show_single;
      case 'book': case 'книги': case 'книга': return t.categories.book_single;
      case 'game': case 'игры': case 'ігри': case 'игра': case 'гра': return t.categories.game_single;
      default: return cat;
    }
  };

  const formatShortDate = (dateVal?: string | null, createdAtVal?: string | null): string => {
    const targetDateStr = dateVal || createdAtVal;
    if (targetDateStr) {
      const d = new Date(targetDateStr);
      if (!isNaN(d.getTime())) {
        const day = d.getDate();
        const month = d.getMonth() + 1;
        const year = String(d.getFullYear()).slice(-2);
        return `${day}.${month}.${year}`;
      }
    }
    const now = new Date();
    return `${now.getDate()}.${now.getMonth() + 1}.${String(now.getFullYear()).slice(-2)}`;
  };

  const statusOptions = [
    { val: 'watching', label: getTranslatedStatus('watching', item.category, t) },
    { val: 'completed', label: t.modal.status_completed },
    { val: 'planned', label: t.modal.status_planned },
  ];

  const handleSelectStatus = (newStatusVal: string) => {
    setIsStatusDropdownOpen(false);
    if (isSharedPreview) {
      setShowSharedPreviewModal(true);
      return;
    }
    if (onUpdateItem) {
      onUpdateItem(item.id, { status: newStatusVal });
    }
  };

  const handleSelectRating = (newRating: number) => {
    if (isSharedPreview) {
      setShowSharedPreviewModal(true);
      return;
    }
    if (isPlanned) {
      setToastMessage(t.details.rating_planned_warning);
      return;
    }
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

  const handleShareTelegram = async () => {
    const catLabel = formatCategorySingle(item.category);
    const shareUrl = `https://t.me/manytgbot?startapp=${item.id}`;
    
    let messageText = `📌 **${item.title} (${catLabel})**`;
    if (!isPlanned) {
      messageText += `\n⭐️ ${t.details.my_rating}: ${currentRating}/10`;
    }
    messageText += `\n\n${t.details.share_app_tagline}`;

    const fullTelegramShare = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(messageText)}`;

    const tg = (window as any).Telegram?.WebApp;
    let opened = false;

    if (tg?.openTelegramLink) {
      try {
        tg.openTelegramLink(fullTelegramShare);
        opened = true;
      } catch (e) {
        console.warn('openTelegramLink error:', e);
      }
    }

    if (!opened && tg?.openLink) {
      try {
        tg.openLink(fullTelegramShare);
        opened = true;
      } catch (e) {
        console.warn('openLink error:', e);
      }
    }

    if (!opened) {
      try {
        window.open(fullTelegramShare, '_blank');
        opened = true;
      } catch (e) {
        console.warn('window.open error:', e);
      }
    }

    // Always copy full text + link to clipboard as a helpful fallback/extra feature on desktop
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        const copyContent = `${messageText}\n${shareUrl}`;
        await navigator.clipboard.writeText(copyContent);
        setToastMessage(t.details.link_copied || 'Ссылка скопирована!');
      }
    } catch (e) {
      console.warn('Clipboard write error:', e);
    }
  };

  const catLower = (item.category || '').toLowerCase().trim();
  const isBook = catLower.includes('book') || catLower.includes('книг');

  // Separate episodes count and duration/pages for display
  let episodesDisplay = item.episodes ? String(item.episodes) : '';
  let durationDisplay = '-';

  let seasonsDisplay = '';

  if (item.duration) {
    const raw = item.duration;
    if (raw.includes('•') || raw.includes('сер.') || raw.includes('сез.') || raw.includes('ep.') || raw.includes('s.') || raw.includes('t.')) {
      const parts = raw.split('•').map(p => p.trim());
      let s = '', e = '', m = '';
      parts.forEach(p => {
        if (p.includes('сез') || p.includes('s.') || p.includes('t.')) s = p.replace(/\D/g, '');
        else if (p.includes('сер') || p.includes('ep')) e = p.replace(/\D/g, '');
        else if (p.includes('мин') || p.includes('min')) m = p.replace(/\D/g, '');
        else {
          if (!e && !s) e = p.replace(/\D/g, '');
          else if (!m) m = p.replace(/\D/g, '');
        }
      });
      seasonsDisplay = s;
      if (!episodesDisplay) episodesDisplay = e;
      durationDisplay = m ? `${m} ${isBook ? (t.details.pages_unit || 'стр.') : t.details.minutes_short}` : '-';
    } else {
      const durNum = raw.replace(/\D/g, '');
      if (isBook) {
        durationDisplay = durNum ? `${durNum} ${t.details.pages_unit || 'стр.'}` : (raw.includes('стр') ? raw : `${raw} ${t.details.pages_unit || 'стр.'}`);
      } else {
        durationDisplay = durNum ? `${durNum} ${t.details.minutes_short}` : raw;
      }
    }
  }

  return (
    <div className="space-y-4 animate-slide-up pb-6">
      {/* Main Poster & Details Card (Title & Menu in top row, 2:3 Aspect Ratio Layout) */}
      <div className="glass-card p-4 rounded-3xl space-y-3 shadow-xl">
        {/* Title & Three-Dots Menu Row (No line below) */}
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-base sm:text-lg font-bold text-white leading-snug break-words flex-1">
            {item.title}
          </h1>

          {/* Three-Dots Menu at top right of title */}
          <div className="relative shrink-0 -mr-1 -mt-1">
            <button
              type="button"
              onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)}
              className={`p-1.5 rounded-full transition active:scale-[0.97] ${
                isHeaderMenuOpen
                  ? 'bg-accentViolet/20 text-accentViolet'
                  : 'text-gray-400 hover:text-accentViolet hover:bg-accentViolet/10'
              }`}
              aria-label="Меню"
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {/* Three Dots Dropdown Menu */}
            {isHeaderMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsHeaderMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-48 glass-card border border-cardBorder rounded-2xl p-1.5 shadow-2xl z-50 animate-slide-up dropdown-menu-container space-y-0.5">
                  <button
                    onClick={() => {
                      setIsHeaderMenuOpen(false);
                      handleShareTelegram();
                    }}
                    className="w-full px-3 py-2.5 rounded-xl flex items-center gap-2.5 text-xs font-semibold text-gray-200 hover:text-white hover:bg-accentViolet/15 hover:text-accentViolet transition dropdown-option-inactive"
                  >
                    <Share2 className="w-4 h-4 text-accentTeal" />
                    <span>{t.details.share || 'Поделиться'}</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsHeaderMenuOpen(false);
                      handleProtectedAction(() => onEdit(item));
                    }}
                    className="w-full px-3 py-2.5 rounded-xl flex items-center gap-2.5 text-xs font-semibold text-gray-200 hover:text-white hover:bg-accentViolet/15 hover:text-accentViolet transition dropdown-option-inactive"
                  >
                    <Edit3 className="w-4 h-4 text-accentViolet" />
                    <span>{t.details.edit || 'Изменить'}</span>
                  </button>

                  <div className="h-px bg-cardBorder/50 my-1" />

                  <button
                    onClick={() => {
                      setIsHeaderMenuOpen(false);
                      handleProtectedAction(() => onDelete(item.id));
                    }}
                    className="w-full px-3 py-2.5 rounded-xl flex items-center gap-2.5 text-xs font-semibold text-red-400 hover:bg-red-500/10 transition"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                    <span>{t.details.delete || 'Удалить'}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex gap-4 items-start pt-1">
          {/* Left: Vertical Poster Image (2:3 Aspect Ratio) */}
          <div className="relative shrink-0 w-32 aspect-[2/3] rounded-2xl overflow-hidden shadow-lg border border-cardBorder group cursor-pointer">
            <img
              src={posterSrc}
              referrerPolicy="no-referrer"
              onClick={() => setIsFullscreenPoster(true)}
              className="w-full h-full object-cover object-center group-hover:scale-105 transition duration-300"
              alt={item.title}
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (!target.dataset.fallback) {
                  target.dataset.fallback = 'true';
                  target.src = getItemPoster({ id: item.id, title: item.title, poster_url: '' });
                }
              }}
            />
          </div>

          {/* Right: Meta Details (Year, Watch date, Genre, Episodes, Duration, Status) */}
          <div className="flex-1 space-y-2 text-xs pt-0.5">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-gray-400 block text-[10px] uppercase tracking-wider font-semibold">
                  {isBook ? 'КНИГА' : formatCategorySingle(item.category)}
                </span>
                <span className="text-sm font-bold text-white flex items-center gap-1.5 inline-flex">
                  {item.release_year ? item.release_year : '2024'}
                  {item.country ? (
                    <span className="font-normal text-base leading-none flex items-center gap-1">
                      <span className="text-gray-400"> • </span>
                      <CountryFlag country={item.country} />
                    </span>
                  ) : null}
                </span>
              </div>

              {/* Favorite Star Button returned to right side of category/year */}
              <button
                type="button"
                onClick={handleToggleFav}
                className="p-1 text-amber-500 hover:scale-110 active:scale-[0.97] transition -mr-1 -mt-1"
                title={t.favorites?.title || 'Избранное'}
              >
                <Star
                  className={`w-6 h-6 transition ${
                    isFav ? 'fill-amber-400 text-amber-400' : 'text-amber-500 stroke-[2] fill-none'
                  }`}
                />
              </button>
            </div>

            <div className="space-y-1.5 pt-1 border-t border-cardBorder/60">
              <div className="flex items-center justify-between text-gray-300 gap-1">
                <span className="text-gray-400 flex items-center gap-1 shrink-0">
                  <Calendar className="w-3.5 h-3.5 text-accentViolet" />
                  {t.details.short_watch_date}
                </span>
                <span className="font-semibold text-white text-right font-mono text-[11px]">
                  {formatShortDate(item.completed_at, item.created_at)}
                </span>
              </div>

              <div className="flex items-center justify-between text-gray-300 gap-1">
                <span className="text-gray-400 flex items-center gap-1 shrink-0">
                  <Tag className="w-3.5 h-3.5 text-accentTeal" />
                  {t.details.genre}
                </span>
                <span className="font-semibold text-white text-right leading-tight truncate min-w-0">
                  {getTranslatedGenreShort(item.genre, t)}
                </span>
              </div>

              {/* Duration / Pages Row */}
              {(!isBook || (durationDisplay && durationDisplay !== '-')) && (
                <div className="flex items-center justify-between text-gray-300 gap-1">
                  <span className="text-gray-400 flex items-center gap-1 shrink-0">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    {isBook ? (t.details.pages || 'Страниц') : t.details.duration}
                  </span>
                  <span className="font-semibold text-white text-right leading-tight truncate min-w-0">{durationDisplay}</span>
                </div>
              )}

              {/* Public Audience Rating Row (Popcorn / Star icon) */}
              {item.public_rating && item.public_rating.trim() !== '' && (
                <div className="flex items-center justify-between text-gray-300 gap-1">
                  <span className="text-gray-400 flex items-center gap-1 shrink-0">
                    {isBook ? <Star className="w-3.5 h-3.5 text-orange-400 fill-orange-400/20" /> : <Popcorn className="w-3.5 h-3.5 text-orange-400" />}
                    {t.details.public_rating || 'Рейтинг'}
                  </span>
                  <span className="font-semibold text-white text-right leading-tight truncate min-w-0 font-mono text-[11px]">
                    {item.public_rating}
                  </span>
                </div>
              )}

              {/* Episodes Row for Series — uses episodes_total if enriched, else legacy field */}
              {!isBook && (item.category === 'show' || item.category === 'series' || item.category === 'сериал' || item.category === 'сериалы' || episodesDisplay || item.episodes_total) && (
                <div className="flex items-center justify-between text-gray-300 gap-1">
                  <span className="text-gray-400 flex items-center gap-1 shrink-0">
                    <Tv className="w-3.5 h-3.5 text-accentPink" />
                    {t.details.episodes}
                  </span>
                  <span className="font-semibold text-white text-right leading-tight truncate min-w-0">
                    {item.episodes_total ? String(item.episodes_total) : (episodesDisplay || '-')}
                  </span>
                </div>
              )}

              {/* Seasons Row for Series — uses seasons field if enriched, else legacy parse */}
              {!isBook && (item.seasons || seasonsDisplay) && (
                <div className="flex items-center justify-between text-gray-300 gap-1">
                  <span className="text-gray-400 flex items-center gap-1 shrink-0">
                    <Tv className="w-3.5 h-3.5 text-orange-400" />
                    {t.details.seasons || 'Сезонов'}
                  </span>
                  <span className="font-semibold text-white text-right leading-tight truncate min-w-0">
                    {item.seasons ? String(item.seasons) : seasonsDisplay}
                  </span>
                </div>
              )}

            </div>

            {/* Interactive Status Pill Button & AI Magic Wand Button */}
            <div className="flex items-center gap-1.5 pt-1.5">
              {/* Status Select Dropdown Container */}
              <div className="relative flex-1 min-w-0">
                <button
                  onClick={() => handleProtectedAction(() => setIsStatusDropdownOpen(!isStatusDropdownOpen))}
                  className="w-full px-2.5 py-2 rounded-xl bg-cardDark border border-cardBorder text-white text-xs font-bold flex items-center justify-between transition active:scale-[0.97] shadow-md hover:border-accentViolet"
                >
                  <span className="font-bold text-white truncate">{getTranslatedStatus(item.status, item.category, t)}</span>
                  <div className="flex items-center gap-0.5 shrink-0 ml-1">
                    <Check className="w-3.5 h-3.5 text-accentTeal stroke-[3]" />
                    <ChevronDown className="w-3.5 h-3.5 text-white/80" />
                  </div>
                </button>

                {/* Dropdown Options */}
                {isStatusDropdownOpen && (
                  <div className="dropdown-menu-container absolute right-0 top-full mt-1 w-full bg-cardDark border border-cardBorder rounded-2xl p-1.5 shadow-2xl space-y-1 z-30 animate-slide-up">
                    {statusOptions.map((opt) => {
                      const isSelected = item.status === opt.val || getTranslatedStatus(item.status, item.category, t) === opt.label;
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

              {/* AI Magic Wand Button */}
              <button
                type="button"
                onClick={() => handleProtectedAction(async () => {
                  if (item.ai_enriched || isEnriching) return;
                  setIsEnriching(true);
                  try {
                    const result = await api.enrichItem(item.id);
                    if (result && onUpdateItem) {
                      const updates: Partial<typeof item> = { ai_enriched: true };
                      if (result.seasons) updates.seasons = result.seasons;
                      if (result.episodes_total) updates.episodes_total = result.episodes_total;
                      if (result.air_status) updates.air_status = result.air_status;
                      if (result.episodes_list) updates.episodes_list = result.episodes_list;
                      if (result.cast_roles) updates.cast_roles = result.cast_roles;
                      if (result.age_rating) updates.age_rating = result.age_rating;
                      if (result.budget) updates.budget = result.budget;
                      onUpdateItem(item.id, updates);
                      setToastMessage('✨ Данные обновлены!');
                    } else {
                      if (onUpdateItem) onUpdateItem(item.id, { ai_enriched: true });
                      setToastMessage('Данные не найдены');
                    }
                  } catch {
                    setToastMessage('Ошибка загрузки');
                  } finally {
                    setIsEnriching(false);
                  }
                })}
                disabled={item.ai_enriched || isEnriching}
                className={`p-2 rounded-xl border flex items-center justify-center transition active:scale-[0.95] shadow-md shrink-0 ${
                  item.ai_enriched
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 cursor-default'
                    : isEnriching
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 cursor-wait animate-pulse'
                    : 'bg-cardDark border-cardBorder text-amber-400 hover:text-amber-300 hover:border-amber-400/50 hover:bg-amber-500/10'
                }`}
                title={item.ai_enriched ? 'Данные уже загружены' : (t.details?.ai_assistant || 'ИИ Помощник')}
              >
                {item.ai_enriched ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Wand2 className={`w-4 h-4 ${isEnriching ? 'text-amber-300' : 'text-amber-400'}`} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Dedicated Director & Cast Full-Width Block for Movies / Shows */}
      {!isBook && (item.director || item.cast) && (
        <div className="glass-card p-4 rounded-3xl space-y-2.5 shadow-sm">
          {item.director && (
            <div className="flex items-start gap-2.5">
              <span className="text-xs text-gray-400 font-semibold flex items-center gap-1.5 shrink-0 pt-0.5">
                <Video className="w-4 h-4 text-accentViolet" />
                {t.details.director}:
              </span>
              <span className="text-xs text-white font-medium leading-relaxed">
                {item.director}
              </span>
            </div>
          )}
          {item.cast && (
            <div className="flex items-start gap-2.5">
              <span className="text-xs text-gray-400 font-semibold flex items-center gap-1.5 shrink-0 pt-0.5">
                <Users className="w-4 h-4 text-accentTeal" />
                {t.details.cast}:
              </span>
              <span className="text-xs text-white font-medium leading-relaxed">
                {item.cast}
              </span>
            </div>
          )}
        </div>
      )}

      {/* AI Enrichment Block: Air Status + Episodes List (series only) */}
      {!isBook && (item.air_status || item.episodes_list) && (() => {
        let parsedEpisodes: Array<{ s: number; e: number; title: string; air_date: string; overview: string; runtime: number }> = [];
        try {
          if (item.episodes_list) parsedEpisodes = JSON.parse(item.episodes_list);
        } catch {}
        return (
          <div className="glass-card p-4 rounded-3xl space-y-3 shadow-sm">
            {/* Air Status badge */}
            {item.air_status && (
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  item.air_status === 'Выходит' ? 'bg-emerald-400 animate-pulse' :
                  item.air_status === 'Завершён' ? 'bg-gray-400' :
                  item.air_status === 'Отменён' ? 'bg-red-400' : 'bg-amber-400'
                }`} />
                <span className="text-xs font-bold text-white">{item.air_status}</span>
                {item.seasons && item.seasons > 0 && (
                  <span className="text-xs text-gray-400 ml-1">• {item.seasons} {item.seasons === 1 ? 'сезон' : item.seasons < 5 ? 'сезона' : 'сезонов'}</span>
                )}
              </div>
            )}
            {/* Episodes accordion */}
            {parsedEpisodes.length > 0 && (
              <EpisodesAccordion episodes={parsedEpisodes} />
            )}
          </div>
        );
      })()}

      {/* AI Enrichment Block: Cast with Roles */}
      {item.cast_roles && (
        <div className="glass-card p-4 rounded-3xl space-y-2 shadow-sm">
          <div className="text-xs text-gray-400 font-semibold flex items-center gap-1.5">
            <Users className="w-4 h-4 text-accentTeal" />
            {t.details.cast || 'В ролях'}
          </div>
          <div className="space-y-1.5 pt-0.5">
            {item.cast_roles.split(', ').map((entry, i) => {
              const [actor, role] = entry.split(' — ');
              return (
                <div key={i} className="flex items-start justify-between gap-2">
                  <span className="text-xs text-white font-medium">{actor?.trim()}</span>
                  {role && <span className="text-xs text-gray-400 italic text-right flex-shrink-0 max-w-[50%]">{role.trim()}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AI Enrichment Block: Age Rating + Budget */}
      {(item.age_rating || item.budget) && (
        <div className="glass-card p-4 rounded-3xl shadow-sm">
          <div className="flex items-center gap-4">
            {item.age_rating && (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg border-2 border-gray-500 flex items-center justify-center">
                  <span className="text-[10px] font-black text-gray-300 leading-none">{item.age_rating}</span>
                </div>
                <span className="text-xs text-gray-400">Возрастной рейтинг</span>
              </div>
            )}
            {item.age_rating && item.budget && <div className="w-px h-8 bg-cardBorder" />}
            {item.budget && (
              <div className="flex flex-col">
                <span className="text-xs text-gray-400">Бюджет</span>
                <span className="text-sm font-bold text-white">{item.budget}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dedicated Author & ISBN Block for Books */}
      {isBook && (item.author || item.isbn) && (
        <div className="glass-card p-4 rounded-3xl space-y-3 shadow-sm flex flex-col">
          {item.author && (
            <div className="flex items-start gap-2.5">
              <span className="text-xs text-gray-400 font-semibold flex items-center gap-1.5 shrink-0 pt-0.5">
                <User className="w-4 h-4 text-accentPink" />
                {t.details.author || 'Автор'}:
              </span>
              <span className="text-xs text-white font-medium leading-relaxed truncate min-w-0">
                {item.author}
              </span>
            </div>
          )}
          {item.isbn && (
            <button
              onClick={() => {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  navigator.clipboard.writeText(item.isbn!);
                  const tg = (window as any).Telegram?.WebApp;
                  if (tg?.HapticFeedback) {
                    tg.HapticFeedback.impactOccurred('light');
                  }
                  setToastMessage(t.details.link_copied || 'Скопировано');
                }
              }}
              className="w-full flex items-center justify-between active:opacity-60 transition"
            >
              <div className="flex items-start gap-2.5 text-left min-w-0">
                <span className="text-xs text-gray-400 font-semibold flex items-center gap-1.5 shrink-0 pt-0.5">
                  <Tag className="w-4 h-4 text-accentBlue" />
                  {t.details.isbn || 'ISBN'}:
                </span>
                <span className="text-[13px] text-white font-mono font-medium leading-relaxed truncate">
                  {item.isbn}
                </span>
              </div>
              <Copy className="w-3.5 h-3.5 text-gray-400 shrink-0 ml-2" />
            </button>
          )}
        </div>
      )}

      {/* Description / Annotation Block */}
      {item.description && (
        <div className="glass-card p-4 rounded-3xl space-y-1.5 shadow-sm">
          <div className="text-xs text-gray-400 font-semibold">
            {isBook ? (t.details.annotation || 'Аннотация') : t.details.description}
          </div>
          <p className={`text-[14px] text-white leading-relaxed font-normal whitespace-pre-line ${!isDescriptionExpanded ? 'line-clamp-3' : ''}`}>
            {item.description}
          </p>
          {item.description.length > 150 && (
            <button
              onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
              className="mt-1 text-xs font-bold text-accentTeal hover:underline flex items-center gap-1 focus:outline-none transition active:scale-[0.97]"
            >
              {isDescriptionExpanded ? (t.details.show_less || 'Скрыть') : (t.details.show_more || 'Ещё...')}
            </button>
          )}
        </div>
      )}



      {/* Watch on YouTube Block (shown ONLY if youtube_url is present) */}
      {item.youtube_url && item.youtube_url.trim() && (
        <div className="glass-card p-4 rounded-3xl space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-red-600/20 text-red-500 flex items-center justify-center">
                <Youtube className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-white tracking-wide">
                {t.details.watch_on_youtube}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {getYouTubeEmbedUrl(item.youtube_url) && (
                <button
                  type="button"
                  onClick={() => setIsFullscreenVideo(true)}
                  className="text-[11px] font-semibold text-accentViolet hover:text-white flex items-center gap-1 bg-accentViolet/10 hover:bg-accentViolet/20 px-2 py-1 rounded-lg transition"
                  title="На весь экран"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Экран</span>
                </button>
              )}
              <a
                href={item.youtube_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-semibold text-accentTeal hover:underline flex items-center gap-1"
              >
                <span>{t.details.open_in_youtube}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {getYouTubeEmbedUrl(item.youtube_url) ? (
            <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-cardBorder shadow-md bg-black group">
              {!isFullscreenVideo ? (
                <>
                  <iframe
                    src={getYouTubeEmbedUrl(item.youtube_url)!}
                    title={item.title}
                    className="w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                    allowFullScreen
                  />
                  <button
                    type="button"
                    onClick={() => setIsFullscreenVideo(true)}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white backdrop-blur-sm hover:bg-black/80 transition active:scale-[0.97] z-10"
                    title="На весь экран"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <div
                  onClick={() => setIsFullscreenVideo(false)}
                  className="w-full h-full flex flex-col items-center justify-center bg-gray-950 text-gray-400 text-xs font-semibold gap-2 cursor-pointer p-4 text-center select-none"
                >
                  <Youtube className="w-8 h-8 text-red-500 animate-pulse" />
                  <span>Воспроизведение на весь экран...</span>
                </div>
              )}
            </div>
          ) : (
            <a
              href={item.youtube_url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 rounded-2xl bg-red-600/10 border border-red-600/20 text-red-400 font-bold text-xs flex items-center justify-center gap-2 hover:bg-red-600/20 transition"
            >
              <Youtube className="w-4 h-4" />
              <span>{t.details.open_in_youtube}</span>
            </a>
          )}
        </div>
      )}

      {/* 10-Star Interactive Rating Block */}
      <div className="glass-card p-4 rounded-3xl space-y-2 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-400 font-semibold">{t.details.my_rating}</div>
          <div className={`text-xl font-extrabold ${isPlanned ? 'text-gray-500' : 'text-accentTeal'}`}>
            {isPlanned ? '- / 10' : `${currentRating}/10`}
          </div>
        </div>

        {/* 10 Interactive Stars */}
        <div className="flex items-center justify-between pt-1">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((starNum) => (
            <button
              key={starNum}
              type="button"
              onClick={(e) => {
                (e.currentTarget as HTMLElement).blur();
                handleSelectRating(starNum);
              }}
              className="p-0.5 focus:outline-none focus:ring-0 active:bg-transparent select-none transition-transform active:scale-[0.97]"
              title={`${starNum}/10`}
            >
              <Star
                className={`w-5 h-5 transition-colors ${
                  !isPlanned && starNum <= currentRating
                    ? 'fill-amber-400 text-amber-400'
                    : 'text-gray-600'
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
              onClick={() => handleProtectedAction(() => setIsEditingNote(true))}
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
              maxLength={1000}
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
          <div
            className="text-xs text-gray-300 leading-relaxed transition whitespace-pre-line"
          >
            {item.note && item.note.trim() ? (
              <span className="italic">"{renderTextWithLinks(item.note)}"</span>
            ) : (
              <span className="text-gray-500 font-normal italic">{t.details.note_placeholder_empty}</span>
            )}
          </div>
        )}
      </div>

      {/* In Lists Block */}
      <div className="glass-card p-4 rounded-3xl space-y-2.5 shadow-sm">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-400 font-semibold flex items-center gap-1.5">
            <BookMarked className="w-4 h-4 text-amber-400" />
            <span>{t.lists?.in_lists || 'В списках'}</span>
          </span>
        </div>

        {assignedLists.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-0.5">
            {assignedLists.map((list) => {
              const isFav = list.id === FAVORITES_ID;
              const listName = isFav ? (t.lists?.favorites || 'Избранное') : list.name;

              return (
                <button
                  key={list.id}
                  onClick={() => handleProtectedAction(() => setIsListModalOpen(true))}
                  className={`px-3 py-1.5 rounded-2xl text-xs font-bold flex items-center gap-1.5 transition border active:scale-[0.97] ${
                    isFav
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
                      : 'bg-accentViolet/15 border-accentViolet/35 text-white hover:bg-accentViolet/25'
                  }`}
                >
                  {isFav ? (
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
                  ) : (
                    <BookMarked className="w-3.5 h-3.5 text-accentViolet shrink-0" />
                  )}
                  <span>{listName}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-gray-500 font-normal italic flex items-center justify-between pt-0.5">
            <span>{t.lists?.not_in_any_list || 'Не добавлен ни в один список'}</span>
            <button
              onClick={() => handleProtectedAction(() => setIsListModalOpen(true))}
              className="text-xs font-bold text-accentViolet hover:underline ml-2"
            >
              + Добавить
            </button>
          </div>
        )}
      </div>

      {/* Action Buttons: Single Add to List button if shared preview, else 3-Column Action Grid */}
      {isSharedPreview ? (
        <div className="pt-2">
          <button
            onClick={() => onAddSharedItem && onAddSharedItem(item)}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-accentViolet to-accentTeal text-white font-bold text-sm shadow-xl hover:opacity-90 active:scale-[0.97] transition flex items-center justify-center gap-2"
          >
            <PlusCircle className="w-5 h-5" />
            <span>{t.details.add_to_list}</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-1.5 sm:gap-2.5 pt-1">
          <button
            onClick={() => setIsListModalOpen(true)}
            className="flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl bg-cardDark border border-cardBorder text-gray-300 hover:text-white transition active:scale-[0.97] shadow-sm"
          >
            <FolderPlus className="w-4 h-4 mb-1 text-amber-400" />
            <span className="text-[10px] sm:text-[11px] font-semibold truncate w-full text-center">{t.details.to_list_btn}</span>
          </button>
          <button
            onClick={() => onEdit(item)}
            className="flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl bg-cardDark border border-cardBorder text-gray-300 hover:text-white transition active:scale-[0.97] shadow-sm"
          >
            <Edit3 className="w-4 h-4 mb-1 text-accentViolet" />
            <span className="text-[10px] sm:text-[11px] font-semibold truncate w-full text-center">{t.details.edit}</span>
          </button>
          <button
            onClick={handleShareTelegram}
            className="flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl bg-cardDark border border-cardBorder text-gray-300 hover:text-white transition active:scale-[0.97] shadow-sm"
          >
            <Share2 className="w-4 h-4 mb-1 text-accentTeal" />
            <span className="text-[10px] sm:text-[11px] font-semibold truncate w-full text-center">{t.details.share}</span>
          </button>
          <button
            onClick={() => onDelete(item.id)}
            className="flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition active:scale-[0.97] shadow-sm"
          >
            <Trash2 className="w-4 h-4 mb-1" />
            <span className="text-[10px] sm:text-[11px] font-semibold truncate w-full text-center">{t.details.delete}</span>
          </button>
        </div>
      )}

      {/* Toast Notification Popup */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-accentViolet/95 backdrop-blur-md text-white text-xs font-semibold px-4 py-2.5 rounded-2xl shadow-2xl animate-fade-in text-center max-w-[85vw] border border-white/20">
          {toastMessage}
        </div>
      )}

      {/* Clean Fullscreen Poster Lightbox Modal using React Portal */}
      {isFullscreenPoster && createPortal(
        <div
          onClick={() => setIsFullscreenPoster(false)}
          className="fixed inset-0 bg-black/95 z-[9999] flex items-center justify-center cursor-pointer animate-fade-in"
        >
          <button
            onClick={() => setIsFullscreenPoster(false)}
            className="absolute right-6 w-12 h-12 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition active:scale-[0.97] shadow-xl"
            style={{
              top: 'max(68px, env(safe-area-inset-top, 68px))',
            }}
          >
            <X className="w-7 h-7" />
          </button>
          <img
            src={posterSrc}
            className="max-w-[100vw] max-h-[100vh] w-full h-full object-contain"
            alt={item.title}
          />
        </div>,
        document.body
      )}

      {/* Clean Fullscreen Video Player Modal for Mobile WebViews */}
      {isFullscreenVideo && item.youtube_url && getYouTubeEmbedUrl(item.youtube_url) && createPortal(
        <div className="fixed inset-0 bg-black z-[999999] flex flex-col items-center justify-center animate-fade-in p-0 select-none">
          {/* Video Iframe Container */}
          <div className="w-full h-full aspect-video flex items-center justify-center my-auto">
            <iframe
              src={getYouTubeEmbedUrl(item.youtube_url, true)!}
              title={item.title}
              className="w-full h-full border-0 shadow-2xl"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
              allowFullScreen
            />
          </div>
        </div>,
        document.body
      )}

      {/* List Selection Modal */}
      <ListSelectionModal
        isOpen={isListModalOpen}
        onClose={() => setIsListModalOpen(false)}
        item={item}
        t={t}
      />

      {/* Modal warning when user tries to edit shared preview item before adding to library */}
      {showSharedPreviewModal && createPortal(
        <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in select-none">
          <div className="w-full max-w-sm bg-cardDark border border-cardBorder rounded-3xl p-6 space-y-4 animate-slide-up shadow-2xl text-center flex flex-col items-center">
            <div className="w-14 h-14 rounded-2xl bg-accentViolet/20 text-accentViolet flex items-center justify-center shadow-inner">
              <PlusCircle className="w-7 h-7 text-accentTeal" />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-bold text-white">
                {t.details.add_first_title || 'Добавьте в свою библиотеку'}
              </h3>
              <p className="text-xs text-gray-300 leading-relaxed px-1">
                {t.details.add_first_desc || 'Чтобы внести изменения — сначала добавьте элемент к себе в библиотеку. Пролистайте вниз и нажмите кнопку «В список».'}
              </p>
            </div>
            <button
              onClick={() => {
                setShowSharedPreviewModal(false);
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
              }}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-accentViolet to-accentTeal text-white font-bold text-xs shadow-lg hover:opacity-95 active:scale-[0.97] transition"
            >
              {t.details.add_first_btn || 'Понятно'}
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
