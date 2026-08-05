// lists.ts — Lists management service
// Stores user-created lists in localStorage, syncs with Telegram CloudStorage
import { saveToCloudStorage, loadFromCloudStorage } from './cloud';

export interface UserList {
  id: string;
  name: string;
  isDefault: boolean; // true for "Favorites" — cannot delete or rename
  itemIds: string[];
  createdAt: string;
}

const LISTS_KEY = 'lista_user_lists';
const LISTS_TS_KEY = 'lista_user_lists_ts';
const FAVORITES_LIST_ID = 'favorites';

function getDefaultFavoritesList(): UserList {
  return {
    id: FAVORITES_LIST_ID,
    name: 'Избранное',
    isDefault: true,
    itemIds: [],
    createdAt: new Date().toISOString(),
  };
}

export function getLists(): UserList[] {
  try {
    const raw = localStorage.getItem(LISTS_KEY);
    if (!raw) return [getDefaultFavoritesList()];
    let parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [getDefaultFavoritesList()];
    
    // Auto-repair from id_map
    try {
      const idMapStr = localStorage.getItem('lista_id_map');
      if (idMapStr) {
        const idMap = JSON.parse(idMapStr);
        let changed = false;
        parsed = parsed.map((l: any) => {
          if (!l.itemIds) return l;
          const newIds = l.itemIds.map((id: string) => {
            if (idMap[id]) {
              changed = true;
              return idMap[id];
            }
            return id;
          });
          return { ...l, itemIds: newIds };
        });
        if (changed) {
          setTimeout(() => saveLists(parsed), 0);
        }
      }
    } catch {}

    // Ensure favorites list always exists
    const hasFavorites = parsed.some((l: UserList) => l.id === FAVORITES_LIST_ID);
    if (!hasFavorites) {
      return [getDefaultFavoritesList(), ...parsed];
    }
    return parsed;
  } catch {
    return [getDefaultFavoritesList()];
  }
}

export function saveLists(lists: UserList[]): void {
  const timestamp = Date.now().toString();
  try {
    localStorage.setItem(LISTS_KEY, JSON.stringify(lists));
    localStorage.setItem(LISTS_TS_KEY, timestamp);
  } catch (e) {
    console.warn('localStorage saveLists error:', e);
  }

  // Dispatch event for UI reactivity
  window.dispatchEvent(new Event('lista_lists_updated'));

  saveToCloudStorage(LISTS_KEY, JSON.stringify(lists));
  saveToCloudStorage(LISTS_TS_KEY, timestamp);
}

export function createList(name: string): UserList {
  const lists = getLists();
  const newList: UserList = {
    id: crypto.randomUUID ? crypto.randomUUID() : `list_${Date.now()}`,
    name,
    isDefault: false,
    itemIds: [],
    createdAt: new Date().toISOString(),
  };
  saveLists([...lists, newList]);
  return newList;
}

export function renameList(listId: string, newName: string): void {
  const lists = getLists();
  const updated = lists.map((l) =>
    l.id === listId && !l.isDefault ? { ...l, name: newName } : l
  );
  saveLists(updated);
}

export function deleteList(listId: string): void {
  const lists = getLists();
  const updated = lists.filter((l) => l.id !== listId || l.isDefault);
  saveLists(updated);
}

export function addItemToList(listId: string, itemId: string): void {
  const lists = getLists();
  const updated = lists.map((l) => {
    if (l.id !== listId) return l;
    if (l.itemIds.includes(itemId)) return l;
    return { ...l, itemIds: [...l.itemIds, itemId] };
  });
  saveLists(updated);
}

export function removeItemFromList(listId: string, itemId: string): void {
  const lists = getLists();
  const updated = lists.map((l) => {
    if (l.id !== listId) return l;
    return { ...l, itemIds: l.itemIds.filter((id) => id !== itemId) };
  });
  saveLists(updated);
}

export function getFavoritesList(): UserList {
  return getLists().find((l) => l.id === FAVORITES_LIST_ID) || getDefaultFavoritesList();
}

export async function syncListsFromCloud(): Promise<void> {
  const val = await loadFromCloudStorage(LISTS_KEY);
  if (!val) {
    const local = getLists();
    if (local.length > 0) {
      const localTs = localStorage.getItem(LISTS_TS_KEY) || Date.now().toString();
      saveToCloudStorage(LISTS_KEY, JSON.stringify(local));
      saveToCloudStorage(LISTS_TS_KEY, localTs);
    }
    return;
  }

  try {
    const parsed = JSON.parse(val);
    if (Array.isArray(parsed)) {
      const cloudTsStr = await loadFromCloudStorage(LISTS_TS_KEY);
      const cloudTs = cloudTsStr ? parseInt(cloudTsStr, 10) : 0;
      const localTsStr = localStorage.getItem(LISTS_TS_KEY);
      const localTs = localTsStr ? parseInt(localTsStr, 10) : 0;

      if (cloudTs > localTs) {
        localStorage.setItem(LISTS_KEY, JSON.stringify(parsed));
        localStorage.setItem(LISTS_TS_KEY, cloudTs.toString());
        window.dispatchEvent(new Event('lista_lists_updated'));
      } else {
        const local = getLists();
        saveToCloudStorage(LISTS_KEY, JSON.stringify(local));
        saveToCloudStorage(LISTS_TS_KEY, (localTs || Date.now()).toString());
      }
    }
  } catch (e) {
    console.warn('Error syncing cloud lists:', e);
  }
}

export const FAVORITES_ID = FAVORITES_LIST_ID;

if (typeof window !== 'undefined') {
  window.addEventListener('ListaItemCreated', (e: any) => {
    const { tempId, realId } = e.detail;
    const lists = getLists();
    let changed = false;
    const updated = lists.map((l) => {
      const idx = l.itemIds.indexOf(tempId);
      if (idx !== -1) {
        changed = true;
        const newItemIds = [...l.itemIds];
        newItemIds[idx] = realId;
        return { ...l, itemIds: newItemIds };
      }
      return l;
    });
    if (changed) {
      saveLists(updated);
    }
  });
}
