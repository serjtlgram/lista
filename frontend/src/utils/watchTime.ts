import { Item } from '../types';

export const MOVIE_AVG_MINUTES = 120; // 2 hours
export const SHOW_DEFAULT_EPISODES = 10;
export const SHOW_DEFAULT_EPISODE_MIN = 40;

const COMPLETED_STATUSES = new Set([
  'completed',
  'просмотрено',
  'завершено',
  'завершён',
  'прочитано',
  'пройдено',
  'переглянуто',
  'виконано',
  'watched',
  'finished',
  'done',
  'visto',
  'completado',
  'leído',
]);

export const isCompleted = (status?: string): boolean => {
  if (!status) return false;
  return COMPLETED_STATUSES.has(status.trim().toLowerCase());
};

export const normCat = (s?: string): string => {
  const lc = (s || '').toLowerCase().trim();
  if (['movie', 'movies', 'фильмы', 'фильм', 'фільм', 'фільми', 'pelicula', 'peliculas', 'películas', 'film', 'cinema'].includes(lc)) return 'Фильмы';
  if (['show', 'shows', 'series', 'сериалы', 'сериал', 'серіал', 'серіали', 'serie', 'series', 'tv', 'дорама', 'дорами', 'аниме', 'аніме', 'anime'].includes(lc)) return 'Сериалы';
  if (['book', 'books', 'книги', 'книга', 'книжка', 'книжки', 'libro', 'libros'].includes(lc)) return 'Книги';
  if (['game', 'games', 'игры', 'игра', 'ігри', 'гра', 'juego', 'juegos'].includes(lc)) return 'Игры';
  return s || '';
};

/**
 * Parses duration string for movies into total minutes.
 * Handles formats:
 * - "2 ч 15 мин", "2ч 15м", "2h 15m", "2 hrs 15 mins", "2 год 15 хв", "2 horas 15 min" -> 135
 * - "120 мин", "120 min", "120 хв", "120m" -> 120
 * - "2 ч", "2h", "2 год", "2 horas" -> 120
 * - "1:45", "01:45:00" -> 105
 * - "95" -> 95
 * - empty or invalid -> MOVIE_AVG_MINUTES (120)
 */
export const parseMovieDuration = (durStr?: string): number => {
  if (!durStr) return MOVIE_AVG_MINUTES;
  const raw = durStr.trim().toLowerCase();
  if (!raw) return MOVIE_AVG_MINUTES;

  // 1. Time colon format: HH:MM or HH:MM:SS
  const colonMatch = raw.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/);
  if (colonMatch) {
    const h = parseInt(colonMatch[1], 10) || 0;
    const m = parseInt(colonMatch[2], 10) || 0;
    const total = h * 60 + m;
    if (total > 0) return total;
  }

  // 2. Hours and minutes: e.g. "1 ч 45 мин", "2h 30m", "2 год 15 хв", "1 hr 20 min", "1 hora 30 min"
  const hrsMinsMatch = raw.match(/(?:(\d+)\s*(?:ч|час|часа|часов|h|hr|hrs|hours?|год|години|годин|hora|horas))\s*(?:(\d+)\s*(?:мин|минут|минуты|m|min|mins|minutes?|хв|хвилини|хвилин|minuto|minutos))?/);
  if (hrsMinsMatch) {
    const h = parseInt(hrsMinsMatch[1], 10) || 0;
    const m = parseInt(hrsMinsMatch[2] || '0', 10) || 0;
    const total = h * 60 + m;
    if (total > 0) return total;
  }

  // 3. Minutes only: e.g. "120 мин", "90 min", "45 хв", "100m"
  const minsMatch = raw.match(/(\d+)\s*(?:мин|минут|минуты|min|mins|minutes?|m|хв|хвилини|хвилин|minuto|minutos)/);
  if (minsMatch) {
    const m = parseInt(minsMatch[1], 10) || 0;
    if (m > 0) return m;
  }

  // 4. Hours only: e.g. "2 ч", "3h", "1 год"
  const hrsOnlyMatch = raw.match(/(\d+)\s*(?:ч|час|часа|часов|h|hr|hrs|hours?|год|години|годин|hora|horas)/);
  if (hrsOnlyMatch) {
    const h = parseInt(hrsOnlyMatch[1], 10) || 0;
    if (h > 0) return h * 60;
  }

  // 5. Plain integer (e.g. "95" -> 95 min, "2" -> 120 min)
  const digitsOnly = raw.replace(/\D/g, '');
  if (digitsOnly) {
    const num = parseInt(digitsOnly, 10);
    if (num > 0 && num <= 6) {
      return num * 60;
    }
    if (num > 6) {
      return num;
    }
  }

  return MOVIE_AVG_MINUTES;
};

/**
 * Computes total watch time in minutes for a TV series item.
 * Evaluates:
 * 1. Exact `episodes_list` if available with per-episode runtimes.
 * 2. `item.episodes_total` or `item.episodes` or episodes extracted from `item.duration`.
 * 3. `item.seasons` or seasons extracted from `item.duration`.
 * 4. Per-episode runtime from `item.duration` or default 40 min.
 */
export const parseSeriesDuration = (item: Item): number => {
  // Step 1: Check episodes_list JSON
  if (item.episodes_list) {
    try {
      const parsed = JSON.parse(item.episodes_list);
      if (Array.isArray(parsed) && parsed.length > 0) {
        let knownRuntimeSum = 0;
        let knownCount = 0;

        for (const ep of parsed) {
          if (ep && typeof ep.runtime === 'number' && ep.runtime > 0) {
            knownRuntimeSum += ep.runtime;
            knownCount++;
          }
        }

        const avgEpMin = knownCount > 0 ? (knownRuntimeSum / knownCount) : SHOW_DEFAULT_EPISODE_MIN;
        const missingCount = parsed.length - knownCount;
        const totalListMinutes = Math.round(knownRuntimeSum + (missingCount * avgEpMin));

        if (totalListMinutes > 0) {
          return totalListMinutes;
        }
      }
    } catch {
      // ignore JSON parse errors
    }
  }

  const durStr = (item.duration || '').trim();

  // Extract episodes count, seasons count, and minutes per episode from duration string
  let parsedSeasons = 0;
  let parsedEpisodes = 0;
  let parsedMinPerEp = 0;

  if (durStr) {
    // If separated by bullet (•) or comma or slash
    const parts = durStr.includes('•') ? durStr.split('•') : durStr.split(/[,;/]/);

    for (const rawPart of parts) {
      const part = rawPart.trim().toLowerCase();
      if (!part) continue;

      // Season check: e.g. "1 сез.", "3 seasons", "2 s.", "1 t.", "temporada 1", "2 sez"
      const sMatch = part.match(/(\d+)\s*(?:сез|sez|season|seasons|temporad|temporadas|t\.|s\.)/);
      if (sMatch && !parsedSeasons) {
        parsedSeasons = parseInt(sMatch[1], 10) || 0;
        continue;
      }

      // Episode check: e.g. "8 сер.", "120 ep.", "24 episodes", "16 capitulos", "10 ser"
      const epMatch = part.match(/(\d+)\s*(?:сер|ep|ep\.|eps|episodes?|series|capitulo|capitulos|capítulo|capítulos|sér\.)/);
      if (epMatch && !parsedEpisodes) {
        parsedEpisodes = parseInt(epMatch[1], 10) || 0;
        continue;
      }

      // Minutes check: e.g. "45 мин.", "50 min", "45 хв.", "45m", "1 ч 10 мин"
      const hrsMinsMatch = part.match(/(?:(\d+)\s*(?:ч|час|h|hr|god|год))\s*(?:(\d+)\s*(?:мин|min|m|хв))?/);
      if (hrsMinsMatch) {
        const h = parseInt(hrsMinsMatch[1], 10) || 0;
        const m = parseInt(hrsMinsMatch[2] || '0', 10) || 0;
        const total = h * 60 + m;
        if (total > 0 && !parsedMinPerEp) {
          parsedMinPerEp = total;
          continue;
        }
      }

      const mMatch = part.match(/(\d+)\s*(?:мин|min|m|хв|минут|minutes?)/);
      if (mMatch && !parsedMinPerEp) {
        parsedMinPerEp = parseInt(mMatch[1], 10) || 0;
        continue;
      }
    }

    // If not matched via parts, try full-string regex
    if (!parsedEpisodes) {
      const epMatch = durStr.toLowerCase().match(/(\d+)\s*(?:сер|ep|ep\.|eps|episodes?|series|capitulo|capitulos|capítulo|capítulos|sér\.)/);
      if (epMatch) parsedEpisodes = parseInt(epMatch[1], 10) || 0;
    }
    if (!parsedSeasons) {
      const sMatch = durStr.toLowerCase().match(/(\d+)\s*(?:сез|sez|season|seasons|temporad|temporadas|t\.|s\.)/);
      if (sMatch) parsedSeasons = parseInt(sMatch[1], 10) || 0;
    }
    if (!parsedMinPerEp) {
      const mMatch = durStr.toLowerCase().match(/(\d+)\s*(?:мин|min|m|хв|минут|minutes?)/);
      if (mMatch) parsedMinPerEp = parseInt(mMatch[1], 10) || 0;
    }

    // If duration string is just a raw number (e.g. "45" or "45 мин")
    if (!parsedMinPerEp && !parsedEpisodes && !parsedSeasons) {
      const digitsOnly = durStr.replace(/\D/g, '');
      if (digitsOnly) {
        const val = parseInt(digitsOnly, 10);
        if (val > 0 && val <= 180) {
          parsedMinPerEp = val;
        }
      }
    }
  }

  // Guard against corrupted / concatenated duration strings (e.g. "22020 мин")
  if (parsedMinPerEp > 180) {
    parsedMinPerEp = SHOW_DEFAULT_EPISODE_MIN;
  }

  // Determine final episode count
  let episodes = item.episodes_total || item.episodes || parsedEpisodes || 0;
  const seasons = item.seasons || parsedSeasons || 0;

  if (episodes === 0 && seasons > 0) {
    episodes = seasons * SHOW_DEFAULT_EPISODES;
  }
  if (episodes === 0) {
    episodes = SHOW_DEFAULT_EPISODES;
  }

  // Determine final minutes per episode
  let minPerEp = parsedMinPerEp || 0;
  if (minPerEp === 0) {
    minPerEp = SHOW_DEFAULT_EPISODE_MIN;
  }

  return episodes * minPerEp;
};

/**
 * Compute watch time in hours for completed movies and TV shows.
 * - Movies: precise parsing of hours/minutes or 2 hours fallback.
 * - Series: precise calculation from episodes list, total episodes, seasons, and episode duration.
 */
export const computeWatchHours = (items: Item[]): number => {
  let totalMin = 0;

  for (const item of items) {
    if (!isCompleted(item.status)) continue;
    const cat = normCat(item.category);
    if (cat !== 'Фильмы' && cat !== 'Сериалы') continue;

    if (cat === 'Сериалы') {
      totalMin += parseSeriesDuration(item);
    } else {
      totalMin += parseMovieDuration(item.duration);
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
    const dateStr = item.completed_at || item.created_at;
    if (!dateStr) return;
    const itemTs = dayStart(new Date(dateStr));
    const idx = slotTimestamps.indexOf(itemTs);
    if (idx >= 0) counts[idx]++;
  });

  return counts;
};
