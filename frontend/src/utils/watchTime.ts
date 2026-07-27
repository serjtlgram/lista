import { Item } from '../types';

const MOVIE_AVG_HOURS = 2; // 120 minutes
const SHOW_DEFAULT_EPISODES = 10;
const SHOW_DEFAULT_EPISODE_MIN = 40;

const isCompleted = (status?: string) =>
  ['completed', 'Просмотрено', 'Завершено'].includes(status || '');

const normCat = (s?: string): string => {
  const lc = (s || '').toLowerCase().trim();
  if (['movie', 'movies', 'фильмы', 'фильм'].includes(lc)) return 'Фильмы';
  if (['show', 'shows', 'series', 'сериалы', 'сериал'].includes(lc)) return 'Сериалы';
  return s || '';
};

/**
 * Compute watch time in hours for completed movies and TV shows.
 * - Movies without duration: counted as 2 hours (120 min).
 * - Shows: if duration or episode count missing, default to 10 episodes and 40 min per episode.
 */
export const computeWatchHours = (items: Item[]): number => {
  let totalMin = 0;

  for (const item of items) {
    if (!isCompleted(item.status)) continue;
    const cat = normCat(item.category);
    if (cat !== 'Фильмы' && cat !== 'Сериалы') continue;

    const dur = (item.duration || '').trim();

    if (cat === 'Сериалы') {
      let episodes = item.episodes || 0;
      let minPerEp = 0;

      if (dur.includes('•')) {
        const parts = dur.split('•');
        const parsedEp = parseInt(parts[0]?.replace(/\D/g, '') || '0', 10);
        const parsedMin = parseInt(parts[1]?.replace(/\D/g, '') || '0', 10);
        if (parsedEp > 0) episodes = parsedEp;
        if (parsedMin > 0) minPerEp = parsedMin;
      } else if (dur.includes('сер.') || dur.includes('ep.')) {
        const parsedEp = parseInt(dur.replace(/\D/g, '') || '0', 10);
        if (parsedEp > 0) episodes = parsedEp;
      } else if (dur.includes('мин') || dur.includes('min') || dur.includes('ч') || dur.includes('h')) {
        let rawMin = parseInt(dur.replace(/\D/g, '') || '0', 10);
        if (dur.includes('ч') || dur.includes('h')) rawMin *= 60;
        if (rawMin > 0 && rawMin <= 120) minPerEp = rawMin;
        else if (rawMin > 120) {
          totalMin += rawMin;
          continue;
        }
      }

      if (episodes === 0) episodes = SHOW_DEFAULT_EPISODES; // 10 eps default
      if (minPerEp === 0) minPerEp = SHOW_DEFAULT_EPISODE_MIN; // 40 min default

      totalMin += episodes * minPerEp;
    } else {
      // Movie
      let rawMin = parseInt(dur.replace(/\D/g, '') || '0', 10);
      if (dur.includes('ч') || dur.includes('h')) rawMin *= 60;
      totalMin += rawMin > 0 ? rawMin : MOVIE_AVG_HOURS * 60; // 120 min default
    }
  }

  return Math.round(totalMin / 60);
};

/**
 * Returns last N days as Date objects, starting from N-1 days ago ending today.
 */
export const getLastNDays = (n: number): Date[] => {
  const today = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (n - 1 - i));
    return d;
  });
};

/**
 * Returns the start of a date (midnight) as timestamp.
 */
export const dayStart = (d: Date): number =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/**
 * Count items per day slot. Slots = array of Date objects (one per bar).
 */
export const countItemsPerSlot = (items: Item[], slots: Date[]): number[] => {
  const counts = new Array(slots.length).fill(0);
  const slotTimestamps = slots.map(dayStart);

  items.forEach((item) => {
    const dateStr = item.created_at || item.completed_at;
    if (!dateStr) return;
    const itemTs = dayStart(new Date(dateStr));
    const idx = slotTimestamps.indexOf(itemTs);
    if (idx >= 0) counts[idx]++;
  });

  return counts;
};
