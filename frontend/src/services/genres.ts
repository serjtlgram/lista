import { Translations } from './i18n';
import genresData from '../../../pkg/genres/genres.json';

type GenreKey = string; // We can use string directly since IDs are defined in JSON

/**
 * Identify canonical genre key from any genre string (Russian, English, Ukrainian, Spanish or key)
 * It loops through all genres in genres.json to find a matching localized string.
 */
export const getGenreKey = (genreStr?: string | null): GenreKey | null => {
  if (!genreStr || !genreStr.trim()) return null;
  const lc = genreStr.toLowerCase().trim();

  const allGenres = [...genresData.movies, ...genresData.books, ...genresData.games];
  
  for (const g of allGenres) {
    if (g.id === lc || 
        g.ru.toLowerCase() === lc || 
        g.en.toLowerCase() === lc || 
        g.uk.toLowerCase() === lc || 
        g.es.toLowerCase() === lc) {
      return g.id;
    }
  }

  // Fallbacks for common variations not perfectly matching
  if (lc.includes('non_fiction') || lc.includes('нон-фикшн') || lc.includes('нон-фікшн') || lc.includes('non-fiction') || lc.includes('science') || lc.includes('history') || lc.includes('история') || lc.includes('історія') || lc.includes('наука')) return 'non_fiction';
  if (lc.includes('business') || lc.includes('бизнес') || lc.includes('бізнес') || lc.includes('экономика') || lc.includes('финансы') || lc.includes('finance') || lc.includes('management')) return 'business';
  if (lc.includes('self-development') || lc.includes('self-help') || lc.includes('саморазвитие') || lc.includes('саморозвиток') || lc.includes('psychology') || lc.includes('психология') || lc.includes('мотивация')) return 'self_dev';
  if (lc.includes('biography') || lc.includes('autobiography') || lc.includes('memoir') || lc.includes('биография') || lc.includes('біографія') || lc.includes('мемуары')) return 'biography';
  if (lc.includes('poetry') || lc.includes('poems') || lc.includes('verses') || lc.includes('поэзия') || lc.includes('поезія') || lc.includes('стихи')) return 'poetry';
  if (lc.includes('romance') || lc.includes('novel') || lc.includes('fiction') || lc.includes('роман') || lc.includes('любовный') || lc.includes('любовний') || lc.includes('художественная') || lc.includes('мелодрама')) return 'novel';
  if (lc.includes('historical') || lc.includes('исторический') || lc.includes('історичний')) return 'non_fiction';
  if (lc.includes('humor') || lc.includes('юмор') || lc.includes('гумор') || lc.includes('комедия')) return 'comedy';
  if (lc.includes('драма') || lc.includes('drama')) return 'drama';
  if (lc.includes('детектив') || lc.includes('detective') || lc.includes('mystery') || lc.includes('crime')) return 'detective';
  if (lc.includes('боевик') || lc.includes('бойовик') || lc.includes('война') || lc.includes('війна') || lc.includes('action') || lc.includes('acción') || lc.includes('guerra')) return 'action';
  if (lc.includes('триллер') || lc.includes('трилер') || lc.includes('thriller') || lc.includes('suspense')) return 'thriller';
  if (lc.includes('ужасы') || lc.includes('жахи') || lc.includes('horror') || lc.includes('terror') || lc.includes('мистика')) return 'horror';
  if (lc.includes('фантастика') || lc.includes('sci-fi') || lc.includes('science fiction') || lc.includes('sci_fi') || lc.includes('научная фантастика') || lc.includes('space') || lc.includes('ciencia')) return 'sci_fi';
  if (lc.includes('приключения') || lc.includes('пригоди') || lc.includes('adventure') || lc.includes('aventura')) return 'adventure';
  if (lc.includes('фэнтези') || lc.includes('фентезі') || lc.includes('fantasy') || lc.includes('fantasía') || lc.includes('magic')) return 'fantasy';
  if (lc.includes('мультфильм') || lc.includes('мультфільм') || lc.includes('анимация') || lc.includes('анімація') || lc.includes('animation') || lc.includes('cartoons') || lc.includes('family')) return 'animation';
  if (lc.includes('ток-шоу') || lc.includes('шоу') || lc.includes('show') || lc.includes('music')) return 'show';
  if (lc.includes('документальный') || lc.includes('documentary') || lc.includes('другое') || lc.includes('other')) return 'other';

  return null;
};

// Helper to get active language code from Translations object.
// We infer it from a known translation, since Translations doesn't store lang code directly.
const getLangCode = (t: Translations): 'ru' | 'en' | 'uk' | 'es' => {
  if (t.nav_home === 'Головна') return 'uk';
  if (t.nav_home === 'Home') return 'en';
  if (t.nav_home === 'Inicio') return 'es';
  return 'ru';
};

/**
 * Get full genre option string for dropdown in user's active language.
 * Strictly guarantees returning an official miniapp genre label.
 */
export const getTranslatedGenreFull = (genreStr: string | null | undefined, t: Translations): string => {
  const lang = getLangCode(t);
  const allGenres = [...genresData.movies, ...genresData.books, ...genresData.games];
  
  const key = getGenreKey(genreStr);
  if (key) {
    const match = allGenres.find(g => g.id === key);
    if (match) {
      return match[lang];
    }
  }

  // Fallback strictly to official "Other" genre label from our miniapp
  const otherMatch = allGenres.find(g => g.id === 'other');
  return otherMatch ? otherMatch[lang] : 'Другое';
};

/**
 * Get short genre label for details card without emojis in user's active language
 */
export const getTranslatedGenreShort = (genreStr: string | null | undefined, t: Translations): string => {
  if (!genreStr || !genreStr.trim()) return '-';
  const full = getTranslatedGenreFull(genreStr, t);
  let cleaned = full.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '').trim();
  let main = cleaned.split('/')[0].trim();
  main = main.split(',')[0].trim();
  return main || '-';
};

/**
 * Get the list of available genres for a specific category
 */
export const getAvailableGenres = (category: string, t?: Translations): string[] => {
  if (!t) return [];
  const catLc = (category || '').toLowerCase().trim();
  const isMovie = ['movie', 'movies', 'фильмы', 'фильм', 'фільми', 'películas'].includes(catLc);
  const isShow = ['show', 'shows', 'series', 'сериалы', 'сериал', 'серіал', 'серіали'].includes(catLc);
  const isBook = ['book', 'books', 'книги', 'книга', 'книжка', 'книжки', 'libros'].includes(catLc);
  const isGame = ['game', 'games', 'игры', 'игра', 'ігри', 'гра', 'juegos'].includes(catLc);

  const lang = getLangCode(t);

  if (isBook) return genresData.books.map(g => g[lang]);
  if (isGame) return genresData.games.map(g => g[lang]);
  
  return genresData.movies.map(g => g[lang]);
};
