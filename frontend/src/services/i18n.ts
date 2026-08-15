import { Language, Translations } from '../locales/types';
import { ru } from '../locales/ru';
import { uk } from '../locales/uk';
import { en } from '../locales/en';
import { es } from '../locales/es';

export type { Language, Translations };

export const translations: Record<Language, Translations> = {
  ru,
  uk,
  en,
  es,
};

export const getTranslatedStatus = (st: string, cat: string, t: Translations): string => {
  const s = (st || '').toLowerCase().trim();
  const c = (cat || '').toLowerCase().trim();

  if (['completed', 'просмотрено', 'завершено', 'завершён', 'посмотрено'].includes(s)) {
    return t.modal.status_completed;
  }
  if (['planned', 'отложено', 'в планах', 'у планах'].includes(s)) {
    return t.modal.status_planned;
  }
  if (['watching', 'смотрю', 'читаю', 'смотрю/читаю', 'дивлясь', 'дивлюсь/читаю', 'слушаю', 'слухаю', 'играю', 'граю', 'viendo'].includes(s)) {
    if (['book', 'books', 'книги', 'книга'].includes(c)) return t.modal.status_watching_book;
    if (['game', 'games', 'игры', 'ігри', 'игра', 'гра'].includes(c)) return t.modal.status_watching_game;
    return t.modal.status_watching_movie; // Default for movies & series
  }
  return st;
};

export const getStoredLanguage = (): Language => {
  // 1. Check saved user language in localStorage (lista_language, i18nextLng, app_language)
  const stored = (
    localStorage.getItem('lista_language') ||
    localStorage.getItem('i18nextLng') ||
    localStorage.getItem('app_language')
  ) as Language;

  if (stored && ['ru', 'uk', 'en', 'es'].includes(stored)) {
    return stored;
  }

  // 2. If NO saved language in localStorage (first run), auto-detect from Telegram WebApp
  try {
    const tgLang = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
    if (tgLang && typeof tgLang === 'string') {
      const code = tgLang.toLowerCase().slice(0, 2);
      if (code === 'uk' || code === 'ua') return 'uk';
      if (code === 'en') return 'en';
      if (code === 'es') return 'es';
      if (code === 'ru') return 'ru';
    }
  } catch (e) {
    console.warn('Telegram language detection error:', e);
  }

  // Also check browser navigator.language as fallback before default fallback
  try {
    const navLang = navigator.language?.toLowerCase().slice(0, 2);
    if (navLang === 'uk' || navLang === 'ua') return 'uk';
    if (navLang === 'en') return 'en';
    if (navLang === 'es') return 'es';
    if (navLang === 'ru') return 'ru';
  } catch (e) {}

  // Fallback language if tgLang is empty or unsupported
  return 'en';
};

export const setStoredLanguage = (lang: Language): void => {
  localStorage.setItem('lista_language', lang);
  localStorage.setItem('i18nextLng', lang);
  localStorage.setItem('app_language', lang);
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.CloudStorage) {
      tg.CloudStorage.setItem('lista_language', lang, (err: any) => {
        if (err) console.warn('CloudStorage setLanguage error:', err);
      });
    }
  } catch (e) {
    console.warn('CloudStorage setLanguage exception:', e);
  }
};

export const getStoredTheme = (): string => {
  const stored = localStorage.getItem('lista_theme');
  if (stored && ['dark', 'dark-black', 'dark-navy', 'dark-neon', 'light', 'light-powdery', 'light-mint', 'light-neon'].includes(stored)) {
    return stored;
  }
  if (stored === 'light') return 'light';
  return 'dark';
};

export const setStoredTheme = (theme: string): void => {
  localStorage.setItem('lista_theme', theme);
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.CloudStorage) {
      tg.CloudStorage.setItem('lista_theme', theme, (err: any) => {
        if (err) console.warn('CloudStorage setTheme error:', err);
      });
    }
  } catch (e) {
    console.warn('CloudStorage setTheme exception:', e);
  }
};

export const DEFAULT_ACTIVE_CATEGORIES = ['Фильмы', 'Сериалы', 'Книги', 'Игры'];

const CANONICAL_CATEGORIES = ['Фильмы', 'Сериалы', 'Книги', 'Игры'];

export const getStoredActiveCategories = (): string[] => {
  try {
    const stored = localStorage.getItem('lista_active_categories');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length >= 1) {
        const filtered = parsed.filter((c: string) => CANONICAL_CATEGORIES.includes(c));
        if (filtered.length >= 1) return filtered;
      }
    }
  } catch (e) {
    console.warn('Error reading active categories:', e);
  }
  return DEFAULT_ACTIVE_CATEGORIES;
};

export const setStoredActiveCategories = (cats: string[]): void => {
  localStorage.setItem('lista_active_categories', JSON.stringify(cats));
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.CloudStorage) {
      tg.CloudStorage.setItem('lista_active_categories', JSON.stringify(cats), (err: any) => {
        if (err) console.warn('CloudStorage setActiveCategories error:', err);
      });
    }
  } catch (e) {
    console.warn('CloudStorage setActiveCategories exception:', e);
  }
};

export const formatCategorySingle = (cat: string, t?: Translations): string => {
  const c = (cat || '').toLowerCase().trim();
  if (['movie', 'movies', 'фильмы', 'фильм', 'фільм', 'фільми'].includes(c)) return t ? t.categories.movie_single : 'Фильм';
  if (['show', 'shows', 'series', 'сериалы', 'сериал', 'серіал', 'серіали'].includes(c)) return t ? t.categories.show_single : 'Сериал';
  if (['book', 'books', 'книги', 'книга'].includes(c)) return t ? t.categories.book_single : 'Книга';
  if (['game', 'games', 'игры', 'ігри', 'игра', 'гра'].includes(c)) return t ? t.categories.game_single : 'Игра';
  return cat || '';
};
