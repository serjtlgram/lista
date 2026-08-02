// favorites.ts — Favorites management service
// Stores favorite item IDs in localStorage, syncs with Telegram CloudStorage
import { saveToCloudStorage, loadFromCloudStorage } from './cloud';

const FAVORITES_KEY = 'lista_favorites';

export function getFavoriteIds(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    let parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Auto-repair from id_map
    try {
      const idMapStr = localStorage.getItem('lista_id_map');
      if (idMapStr) {
        const idMap = JSON.parse(idMapStr);
        let changed = false;
        parsed = parsed.map((id: string) => {
          if (idMap[id]) {
            changed = true;
            return idMap[id];
          }
          return id;
        });
        if (changed) {
          setTimeout(() => setFavoriteIds(parsed), 0);
        }
      }
    } catch {}

    return parsed;
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
  saveToCloudStorage(FAVORITES_KEY, JSON.stringify(ids));
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
  const val = await loadFromCloudStorage(FAVORITES_KEY);
  if (val) {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) {
        const localFavs = getFavoriteIds();
        const mergedFavs = Array.from(new Set([...parsed, ...localFavs]));
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(mergedFavs));
        saveToCloudStorage(FAVORITES_KEY, JSON.stringify(mergedFavs));
        window.dispatchEvent(new Event('lista_favorites_updated'));
      }
    } catch {}
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('ListaItemCreated', (e: any) => {
    const { tempId, realId } = e.detail;
    const ids = getFavoriteIds();
    const idx = ids.indexOf(tempId);
    if (idx !== -1) {
      ids[idx] = realId;
      setFavoriteIds(ids);
    }
  });
}
