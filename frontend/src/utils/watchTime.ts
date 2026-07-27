import { Item } from '../types';

const MOVIE_AVG_HOURS = 2;
const EPISODE_AVG_MIN = 45;

const isCompleted = (status?: string) =>
  ['completed', 'Просмотрено', 'Завершено'].includes(status || '');

const normCat = (s?: string): string => {
  const lc = (s || '').toLowerCase().trim();
  if (['movie', 'movies', 'фильмы', 'фильм'].includes(lc)) return 'Фильмы';
  if (['show', 'shows', 'series', 'сериалы', 'сериал'].includes(lc)) return 'Сериалы';
  return s || '';
};

/**
 * Compute approximate watch time in hours for completed movies and shows only.
 * - Movies without duration: counted as 2 hours each.
 * - Shows without duration: 45 min × episodes (or 10 eps × 45 min if no episode info).
 */
export const computeWatchHours = (items: Item[]): number => {
  let totalMin = 0;

  for (const item of items) {
    if (!isCompleted(item.status)) continue;
    const cat = normCat(item.category);
    if (cat !== 'Фильмы' && cat !== 'Сериалы') continue;

    const dur = (item.duration || '').trim();

    if (cat === 'Сериалы') {
      if (dur.includes('•')) {
        const parts = dur.split('•');
        const ep = parseInt(parts[0]?.replace(/\D/g, '') || '0', 10);
        const minPerEp = parseInt(parts[1]?.replace(/\D/g, '') || String(EPISODE_AVG_MIN), 10);
        totalMin += (ep > 0 ? ep : 1) * (minPerEp > 0 ? minPerEp : EPISODE_AVG_MIN);
      } else if (item.episodes && item.episodes > 0) {
        const minPerEp = dur ? (parseInt(dur.replace(/\D/g, '') || '0', 10) || EPISODE_AVG_MIN) : EPISODE_AVG_MIN;
        totalMin += item.episodes * minPerEp;
      } else {
        const raw = parseInt(dur.replace(/\D/g, '') || '0', 10);
        totalMin += raw > 0 ? raw : EPISODE_AVG_MIN * 10;
      }
    } else {
      // Movie
      const raw = parseInt(dur.replace(/\D/g, '') || '0', 10);
      totalMin += raw > 0 ? raw : MOVIE_AVG_HOURS * 60;
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
