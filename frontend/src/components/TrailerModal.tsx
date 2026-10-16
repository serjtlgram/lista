import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Youtube, ExternalLink, Loader2 } from 'lucide-react';
import { api } from '../services/api';

interface TrailerModalProps {
  isOpen: boolean;
  onClose: () => void;
  youtubeUrl?: string;
  title: string;
  category?: string;
  releaseYear?: string;
  director?: string;
  onUpdateYoutubeUrl?: (url: string) => void;
}

export const getYouTubeEmbedUrl = (url?: string, autoplay = true): string | null => {
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

export const TrailerModal: React.FC<TrailerModalProps> = ({
  isOpen,
  onClose,
  youtubeUrl,
  title,
  category,
  releaseYear,
  director,
  onUpdateYoutubeUrl,
}) => {
  const [activeUrl, setActiveUrl] = useState<string | undefined>(youtubeUrl);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    setActiveUrl(youtubeUrl);
  }, [youtubeUrl]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    if (!activeUrl && title && !isSearching) {
      setIsSearching(true);
      api
        .searchYouTube(title, category, releaseYear, director)
        .then((foundUrl) => {
          if (foundUrl) {
            setActiveUrl(foundUrl);
            onUpdateYoutubeUrl?.(foundUrl);
          }
        })
        .finally(() => {
          setIsSearching(false);
        });
    }
  }, [isOpen, activeUrl, title, category, releaseYear, director, onUpdateYoutubeUrl]);

  if (!isOpen) return null;

  const currentUrl = activeUrl || youtubeUrl;
  const embedUrl = getYouTubeEmbedUrl(currentUrl, true);
  const catLower = (category || '').toLowerCase();
  const isGame = catLower.includes('game') || catLower.includes('игр');
  const isBook = catLower.includes('book') || catLower.includes('книг');
  const searchFallbackTerm = isGame
    ? `${title} трейлер игры`
    : isBook
    ? `${title} буктрейлер`
    : `${title} трейлер`;
  const searchFallbackUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
    searchFallbackTerm
  )}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fade-in select-none"
      onClick={onClose}
    >
      <div
        className="w-[96vw] md:w-[72vw] max-w-5xl bg-cardDark border border-cardBorder rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-cardBorder/60 bg-bgDark/50">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <div className="w-7 h-7 rounded-lg bg-red-600/20 text-red-500 flex items-center justify-center shrink-0">
              <Youtube className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white truncate">{title}</h3>
              <p className="text-[11px] text-gray-400">Трейлер и видеоматериалы</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {currentUrl ? (
              <a
                href={currentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cardBorder/40 hover:bg-cardBorder/80 text-gray-300 hover:text-white text-xs font-semibold transition active:scale-95"
              >
                <span>YouTube</span>
                <ExternalLink className="w-3.5 h-3.5 text-accentTeal" />
              </a>
            ) : (
              <a
                href={searchFallbackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cardBorder/40 hover:bg-cardBorder/80 text-gray-300 hover:text-white text-xs font-semibold transition active:scale-95"
              >
                <span>Поиск на YouTube</span>
                <ExternalLink className="w-3.5 h-3.5 text-accentTeal" />
              </a>
            )}

            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-xl bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white transition active:scale-95"
              title="Закрыть"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Video Player Area (60-70% width, aspect-video) */}
        <div className="relative w-full aspect-video bg-black flex items-center justify-center">
          {embedUrl ? (
            <iframe
              src={embedUrl}
              title={title}
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
              allowFullScreen
            />
          ) : isSearching ? (
            <div className="flex flex-col items-center justify-center text-center p-6 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-red-600/15 text-red-500 flex items-center justify-center animate-pulse">
                <Youtube className="w-8 h-8" />
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-300 font-medium">
                <div className="w-4 h-4 rounded-full border-2 border-accentViolet border-t-transparent animate-spin" />
                <span>Поиск официального трейлера...</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-6 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-red-600/15 text-red-500 flex items-center justify-center">
                <Youtube className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-white">Прямой трейлер пока не указан</p>
                <p className="text-xs text-gray-400 max-w-sm">
                  Вы можете найти и посмотреть официальный трейлер прямо на YouTube в один клик.
                </p>
              </div>
              <a
                href={searchFallbackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 text-white font-bold text-xs shadow-lg hover:opacity-95 transition active:scale-95"
              >
                <Youtube className="w-4 h-4" />
                <span>Найти трейлер на YouTube</span>
              </a>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
