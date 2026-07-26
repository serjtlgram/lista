import placeholder1 from '../assets/placeholder1.webp';
import placeholder2 from '../assets/placeholder2.webp';
import placeholder3 from '../assets/placeholder3.webp';
import placeholder4 from '../assets/placeholder4.webp';

export const PLACEHOLDER_POSTERS = [
  placeholder1,
  placeholder2,
  placeholder3,
  placeholder4,
];

const STORAGE_KEY = 'lista_placeholder_index';

/**
 * Get next placeholder sequentially for NEW items being created without poster.
 * Cycle: 1 -> 2 -> 3 -> 4 -> 1 ...
 */
export const getNextPlaceholderPoster = (): string => {
  let currentIndex = 0;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        currentIndex = parsed;
      }
    }
  } catch (e) {
    currentIndex = 0;
  }

  const poster = PLACEHOLDER_POSTERS[currentIndex % PLACEHOLDER_POSTERS.length];

  try {
    localStorage.setItem(STORAGE_KEY, String((currentIndex + 1) % PLACEHOLDER_POSTERS.length));
  } catch (e) {}

  return poster;
};

/**
 * Check if a poster_url is empty / missing / dummy / unsplash / old banner_default
 */
export const isMissingOrDummyPoster = (url?: string | null): boolean => {
  if (!url || !url.trim()) return true;
  const u = url.toLowerCase();
  if (u.includes('unsplash.com') || u.includes('banner_default') || u === 'placeholder') return true;
  return false;
};

/**
 * Get display poster for an item. If missing or dummy, returns deterministic placeholder.
 */
export const getItemPoster = (item: { id?: string; title?: string; poster_url?: string | null }): string => {
  if (!isMissingOrDummyPoster(item.poster_url)) {
    return item.poster_url!;
  }

  let seed = 0;
  const key = item.id || item.title || '';
  for (let i = 0; i < key.length; i++) {
    seed += key.charCodeAt(i);
  }
  return PLACEHOLDER_POSTERS[Math.abs(seed) % PLACEHOLDER_POSTERS.length];
};
