// favorites.ts — Favorites management service
// Stores favorite item IDs in localStorage, syncs with Telegram CloudStorage
import { saveToCloudStorage, loadFromCloudStorage } from './cloud';

const FAVORITES_KEY = 'lista_favorites';
const FAVORITES_TS_KEY = 'lista_favorites_ts';

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
  const timestamp = Date.now().toString();
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
    localStorage.setItem(FAVORITES_TS_KEY, timestamp);
  } catch (e) {
    console.warn('localStorage setFavoriteIds error:', e);
  }

  // Dispatch event for UI reactivity
  window.dispatchEvent(new Event('lista_favorites_updated'));

  // Sync to Telegram CloudStorage
  saveToCloudStorage(FAVORITES_KEY, JSON.stringify(ids));
  saveToCloudStorage(FAVORITES_TS_KEY, timestamp);
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
  if (!val) {
    const localFavs = getFavoriteIds();
    if (localFavs.length > 0) {
      const localTs = localStorage.getItem(FAVORITES_TS_KEY) || Date.now().toString();
      saveToCloudStorage(FAVORITES_KEY, JSON.stringify(localFavs));
      saveToCloudStorage(FAVORITES_TS_KEY, localTs);
    }
    return;
  }

  try {
    const parsed = JSON.parse(val);
    if (Array.isArray(parsed)) {
      const cloudTsStr = await loadFromCloudStorage(FAVORITES_TS_KEY);
      const cloudTs = cloudTsStr ? parseInt(cloudTsStr, 10) : 0;
      const localTsStr = localStorage.getItem(FAVORITES_TS_KEY);
      const localTs = localTsStr ? parseInt(localTsStr, 10) : 0;

      if (cloudTs > localTs) {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(parsed));
        localStorage.setItem(FAVORITES_TS_KEY, cloudTs.toString());
        window.dispatchEvent(new Event('lista_favorites_updated'));
      } else {
        const localFavs = getFavoriteIds();
        saveToCloudStorage(FAVORITES_KEY, JSON.stringify(localFavs));
        saveToCloudStorage(FAVORITES_TS_KEY, (localTs || Date.now()).toString());
      }
    }
  } catch (e) {
    console.warn('syncFavoritesFromCloud error:', e);
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
