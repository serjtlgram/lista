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

  if (['completed', 'просмотрено', 'завершено', 'посмотрено'].includes(s)) {
    return t.modal.status_completed;
  }
  if (['planned', 'отложено', 'в планах', 'у планах'].includes(s)) {
    return t.modal.status_planned;
  }
  if (['watching', 'смотрю', 'читаю', 'смотрю/читаю', 'дивлясь', 'дивлюсь/читаю', 'слушаю', 'слухаю', 'играю', 'граю', 'viendo'].includes(s)) {
    if (['book', 'books', 'книги', 'книга'].includes(c)) return t.modal.status_watching_book;
    if (['audiobook', 'audiobooks', 'аудиокниги', 'аудіокниги', 'podcast', 'podcasts', 'подкасты', 'подкасти'].includes(c)) return t.modal.status_watching_audio;
    if (['game', 'games', 'игры', 'ігри', 'игра', 'гра'].includes(c)) return t.modal.status_watching_game;
    return t.modal.status_watching_movie; // Default for movies & series
  }
  return st;
};

export const getStoredLanguage = (): Language => {
  const stored = localStorage.getItem('lista_language') as Language;
  if (stored && ['ru', 'uk', 'en', 'es'].includes(stored)) {
    return stored;
  }
  return 'ru';
};

export const setStoredLanguage = (lang: Language): void => {
  localStorage.setItem('lista_language', lang);
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

export const getStoredTheme = (): 'dark' | 'light' => {
  const stored = localStorage.getItem('lista_theme');
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  return 'dark';
};

export const setStoredTheme = (theme: 'dark' | 'light'): void => {
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

export const DEFAULT_ACTIVE_CATEGORIES = ['Фильмы', 'Сериалы'];

export const getStoredActiveCategories = (): string[] => {
  try {
    const stored = localStorage.getItem('lista_active_categories');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length >= 2) {
        return parsed;
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
