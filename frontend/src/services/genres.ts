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
  if (lc.includes('non_fiction') || lc.includes('нон-фикшн') || lc.includes('нон-фікшн') || lc.includes('non-fiction')) return 'non_fiction';
  if (lc.includes('romance') || lc.includes('любовный') || lc.includes('любовний') || lc.includes('мелодрама')) return 'novel';
  if (lc.includes('historical') || lc.includes('исторический') || lc.includes('історичний') || lc.includes('история') || lc.includes('історія')) return 'other';
  if (lc.includes('biography') || lc.includes('биография') || lc.includes('біографія') || lc.includes('мемуары')) return 'biography';
  if (lc.includes('humor') || lc.includes('юмор') || lc.includes('гумор') || lc.includes('комедия')) return 'comedy';
  if (lc.includes('драма') || lc.includes('drama')) return 'drama';
  if (lc.includes('детектив') || lc.includes('detective')) return 'detective';
  if (lc.includes('боевик') || lc.includes('бойовик') || lc.includes('война') || lc.includes('війна') || lc.includes('action') || lc.includes('acción') || lc.includes('guerra')) return 'action';
  if (lc.includes('триллер') || lc.includes('трилер') || lc.includes('thriller')) return 'thriller';
  if (lc.includes('ужасы') || lc.includes('жахи') || lc.includes('horror') || lc.includes('terror')) return 'horror';
  if (lc.includes('фантастика') || lc.includes('sci-fi') || lc.includes('sci_fi') || lc.includes('научная фантастика') || lc.includes('ciencia')) return 'sci_fi';
  if (lc.includes('приключения') || lc.includes('пригоди') || lc.includes('adventure') || lc.includes('aventura')) return 'adventure';
  if (lc.includes('фэнтези') || lc.includes('фентезі') || lc.includes('fantasy') || lc.includes('fantasía')) return 'fantasy';
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
 * Get full genre option string for dropdown in user's active language
 */
export const getTranslatedGenreFull = (genreStr: string | null | undefined, t: Translations): string => {
  const key = getGenreKey(genreStr);
  if (key) {
    const allGenres = [...genresData.movies, ...genresData.books, ...genresData.games];
    const match = allGenres.find(g => g.id === key);
    if (match) {
      const lang = getLangCode(t);
      return match[lang];
    }
  }
  return genreStr || 'Другое';
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
