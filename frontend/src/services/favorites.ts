// favorites.ts — Favorites management service
// Stores favorite item IDs in localStorage, syncs with Telegram CloudStorage

const FAVORITES_KEY = 'lista_favorites';

export function getFavoriteIds(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function setFavoriteIds(ids: string[]): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
  } catch (e) {
    console.warn('localStorage setFavoriteIds error:', e);
  }

  // Dispatch event for UI reactivity
  window.dispatchEvent(new Event('lista_favorites_updated'));

  // Sync to Telegram CloudStorage
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.CloudStorage) {
    try {
      tg.CloudStorage.setItem(FAVORITES_KEY, JSON.stringify(ids), (err: any) => {
        if (err) console.warn('CloudStorage setFavoriteIds error:', err);
      });
    } catch (e) {
      console.warn('CloudStorage favorites sync error:', e);
    }
  }
}

export function isFavorite(itemId: string): boolean {
  return getFavoriteIds().includes(itemId);
}

export function toggleFavorite(itemId: string): boolean {
  const ids = getFavoriteIds();
  const idx = ids.indexOf(itemId);
  if (idx === -1) {
    ids.push(itemId);
    setFavoriteIds(ids);
    return true; // now is favorite
  } else {
    ids.splice(idx, 1);
    setFavoriteIds(ids);
    return false; // no longer favorite
  }
}

export async function syncFavoritesFromCloud(): Promise<void> {
  return new Promise((resolve) => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg?.CloudStorage) {
      resolve();
      return;
    }
    try {
      tg.CloudStorage.getItem(FAVORITES_KEY, (err: any, val: string) => {
        if (!err && val !== undefined && val !== null && val !== '') {
          try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) {
              const localFavs = getFavoriteIds();
              const mergedFavs = Array.from(new Set([...parsed, ...localFavs]));
              localStorage.setItem(FAVORITES_KEY, JSON.stringify(mergedFavs));
              tg.CloudStorage.setItem(FAVORITES_KEY, JSON.stringify(mergedFavs), () => {});
              window.dispatchEvent(new Event('lista_favorites_updated'));
            }
          } catch {}
        }
        resolve();
      });
    } catch {
      resolve();
    }
  });
}
