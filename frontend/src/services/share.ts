import { Item } from '../types';
import { Translations, getStoredLanguage } from './i18n';
import { ru } from '../locales/ru';
import { api } from './api';

export const formatCategorySingle = (cat: string, t?: Translations): string => {
  const trans = t || ru;
  switch (cat?.toLowerCase()) {
    case 'movie': case 'movies': case 'фильмы': case 'фильм': return trans.categories.movie_single;
    case 'show': case 'shows': case 'series': case 'сериалы': case 'сериал': return trans.categories.show_single;
    case 'book': case 'books': case 'книги': case 'книга': return trans.categories.book_single;
    case 'game': case 'games': case 'игры': case 'ігри': case 'игра': case 'гра': return trans.categories.game_single;
    default: return cat;
  }
};

export const shareItem = async (
  item: Item,
  t?: Translations,
  onCopiedToast?: (msg: string) => void
) => {
  const trans = t || ru;
  const tg = (window as any).Telegram?.WebApp;

  if (tg?.HapticFeedback) {
    try {
      tg.HapticFeedback.notificationOccurred('success');
    } catch (e) {
      console.warn('Haptic feedback error:', e);
    }
  }

  // 1. Native Telegram shareMessage via savePreparedInlineMessage (Bot API 7.8+)
  if (tg && typeof tg.shareMessage === 'function') {
    try {
      const prepared = await api.prepareShareItem(item.id, {
        title: item.title,
        category: item.category,
        rating: item.rating,
        poster_url: item.poster_url,
        description: item.description,
        release_year: item.release_year,
        genre: item.genre,
        lang: getStoredLanguage(),
      });
      if (prepared?.id) {
        tg.shareMessage(prepared.id, (isSent: boolean) => {
          if (isSent && onCopiedToast) {
            onCopiedToast(trans.details.link_copied || 'Отправлено!');
          }
        });
        return;
      }
    } catch (e) {
      console.warn('Telegram shareMessage error, falling back to switchInlineQuery:', e);
    }
  }

  // 2. Telegram switchInlineQuery fallback (opens chat picker with @manytgbot id:...)
  if (tg && typeof tg.switchInlineQuery === 'function') {
    try {
      tg.switchInlineQuery(`id:${item.id}`);
      return;
    } catch (e) {
      console.warn('Telegram switchInlineQuery error:', e);
    }
  }

  // 3. Fallback: browser / outside Telegram
  const catLabel = formatCategorySingle(item.category, trans);
  const shareUrl = `https://t.me/manytgbot?startapp=${item.id}`;
  const isPlanned = item.status === 'planned' || item.status === 'в планах' || item.status === 'у планах' || item.status === 'отложено';

  let messageText = `📌 **${item.title} (${catLabel})**`;
  if (!isPlanned && item.rating > 0) {
    messageText += `\n⭐️ ${trans.details.my_rating}: ${item.rating}/10`;
  }
  messageText += `\n\n${trans.details.share_app_tagline}`;

  const fullTelegramShare = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(messageText)}`;

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

  // Always copy full text + link to clipboard as fallback
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      const copyContent = `${messageText}\n${shareUrl}`;
      await navigator.clipboard.writeText(copyContent);
      if (onCopiedToast) {
        onCopiedToast(trans.details.link_copied || 'Ссылка скопирована!');
      }
    }
  } catch (e) {
    console.warn('Clipboard write error:', e);
  }
};
