import { Translations } from './i18n';

export type GenreKey =
  | 'drama'
  | 'comedy'
  | 'detective'
  | 'action'
  | 'thriller'
  | 'horror'
  | 'sci_fi'
  | 'adventure'
  | 'fantasy'
  | 'animation'
  | 'show'
  | 'other'
  | 'non_fiction'
  | 'romance'
  | 'historical'
  | 'biography'
  | 'humor';

export const GENRE_KEYS: GenreKey[] = [
  'drama',
  'comedy',
  'detective',
  'action',
  'thriller',
  'horror',
  'sci_fi',
  'adventure',
  'fantasy',
  'animation',
  'show',
  'other',
];

export const BOOK_GENRE_KEYS: GenreKey[] = [
  'sci_fi',
  'fantasy',
  'adventure',
  'non_fiction',
  'romance',
  'historical',
  'biography',
  'humor',
  'drama',
  'detective',
  'thriller',
  'horror',
];

/**
 * Identify canonical genre key from any genre string (Russian, English, Ukrainian, Spanish or key)
 */
export const getGenreKey = (genreStr?: string | null): GenreKey | null => {
  if (!genreStr || !genreStr.trim()) return null;
  const lc = genreStr.toLowerCase().trim();

  if (lc.includes('non_fiction') || lc.includes('нон-фикшн') || lc.includes('нон-фікшн') || lc.includes('non-fiction')) return 'non_fiction';
  if (lc.includes('romance') || lc.includes('любовный') || lc.includes('любовний') || lc.includes('мелодрама')) return 'romance';
  if (lc.includes('historical') || lc.includes('исторический') || lc.includes('історичний') || lc.includes('история') || lc.includes('історія')) return 'historical';
  if (lc.includes('biography') || lc.includes('биография') || lc.includes('біографія') || lc.includes('мемуары')) return 'biography';
  if (lc.includes('humor') || lc.includes('юмор') || lc.includes('гумор') || lc.includes('комедия')) return 'humor';
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

/**
 * Get full genre option string for dropdown in user's active language
 */
export const getTranslatedGenreFull = (genreStr: string | null | undefined, t: Translations): string => {
  const key = getGenreKey(genreStr);
  if (key && t.genres && t.genres[key]) {
    return t.genres[key];
  }
  return genreStr || (t.genres ? t.genres.drama : 'Драма');
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

  if (isMovie || isShow) return Object.values(t.genres);
  if (isBook) return t.book_genres ? Object.values(t.book_genres) : Object.values(t.genres);
  if (isGame) return t.game_genres ? Object.values(t.game_genres) : Object.values(t.genres);
  
  return Object.values(t.genres);
};
