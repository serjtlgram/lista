import { Translations } from './i18n';

export type GenreKey =
  | 'romance_drama'
  | 'comedy'
  | 'action_war'
  | 'detective'
  | 'horror'
  | 'sci_fi'
  | 'fantasy'
  | 'thriller'
  | 'adventure'
  | 'family'
  | 'documentary'
  | 'talk_music';

export const GENRE_KEYS: GenreKey[] = [
  'romance_drama',
  'comedy',
  'action_war',
  'detective',
  'horror',
  'sci_fi',
  'fantasy',
  'thriller',
  'adventure',
  'family',
  'documentary',
  'talk_music',
];

/**
 * Identify canonical genre key from any genre string (Russian, English, Ukrainian, Spanish or key)
 */
export const getGenreKey = (genreStr?: string | null): GenreKey | null => {
  if (!genreStr || !genreStr.trim()) return null;
  const lc = genreStr.toLowerCase().trim();

  if (lc.includes('мелодрама') || lc.includes('драма') || lc.includes('romance') || lc.includes('romance_drama')) return 'romance_drama';
  if (lc.includes('комедия') || lc.includes('комедія') || lc.includes('comedy') || lc.includes('comedia')) return 'comedy';
  if (lc.includes('боевик') || lc.includes('бойовик') || lc.includes('война') || lc.includes('війна') || lc.includes('action') || lc.includes('acción') || lc.includes('guerra')) return 'action_war';
  if (lc.includes('детектив') || lc.includes('detective')) return 'detective';
  if (lc.includes('ужасы') || lc.includes('жахи') || lc.includes('horror') || lc.includes('terror')) return 'horror';
  if (lc.includes('фантастика') || lc.includes('sci-fi') || lc.includes('ciencia')) return 'sci_fi';
  if (lc.includes('фэнтези') || lc.includes('фентезі') || lc.includes('fantasy') || lc.includes('fantasía')) return 'fantasy';
  if (lc.includes('триллер') || lc.includes('трилер') || lc.includes('thriller')) return 'thriller';
  if (lc.includes('приключения') || lc.includes('пригоди') || lc.includes('adventure') || lc.includes('aventura')) return 'adventure';
  if (lc.includes('семейный') || lc.includes('сімейний') || lc.includes('family') || lc.includes('familiar')) return 'family';
  if (lc.includes('документальный') || lc.includes('документальний') || lc.includes('documentary') || lc.includes('documental')) return 'documentary';
  if (lc.includes('ток-шоу') || lc.includes('музыка') || lc.includes('музика') || lc.includes('talk') || lc.includes('música') || lc.includes('music')) return 'talk_music';

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
  return genreStr || (t.genres ? t.genres.romance_drama : '❤️ Мелодрама/Драма');
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
