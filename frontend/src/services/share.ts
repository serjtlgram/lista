import { Item } from '../types';
import { Translations } from './i18n';
import { ru } from '../locales/ru';

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
  const catLabel = formatCategorySingle(item.category, trans);
  const shareUrl = `https://t.me/manytgbot?startapp=${item.id}`;
  
  const isPlanned = item.status === 'planned' || item.status === 'в планах' || item.status === 'у планах' || item.status === 'отложено';

  let messageText = `📌 **${item.title} (${catLabel})**`;
  if (!isPlanned && item.rating > 0) {
    messageText += `\n⭐️ ${trans.details.my_rating}: ${item.rating}/10`;
  }
  messageText += `\n\n${trans.details.share_app_tagline}`;

  const fullTelegramShare = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(messageText)}`;

  const tg = (window as any).Telegram?.WebApp;
  if (tg?.HapticFeedback) {
    try {
      tg.HapticFeedback.notificationOccurred('success');
    } catch (e) {
      console.warn('Haptic feedback error:', e);
    }
  }

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

  // Always copy full text + link to clipboard
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
