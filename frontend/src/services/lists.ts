// lists.ts — Lists management service
// Stores user-created lists in localStorage, syncs with Telegram CloudStorage

export interface UserList {
  id: string;
  name: string;
  isDefault: boolean; // true for "Favorites" — cannot delete or rename
  itemIds: string[];
  createdAt: string;
}

const LISTS_KEY = 'lista_user_lists';
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
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [getDefaultFavoritesList()];
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
  localStorage.setItem(LISTS_KEY, JSON.stringify(lists));
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.CloudStorage) {
    try {
      tg.CloudStorage.setItem(LISTS_KEY, JSON.stringify(lists), () => {});
    } catch (e) {
      console.warn('CloudStorage lists sync error:', e);
    }
  }
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

export function syncListsFromCloud(): Promise<void> {
  return new Promise((resolve) => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg?.CloudStorage) { resolve(); return; }
    try {
      tg.CloudStorage.getItem(LISTS_KEY, (err: any, val: string) => {
        if (!err && val) {
          try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) {
              // Merge: cloud has priority, but keep local-only lists
              const local = getLists();
              const cloudIds = parsed.map((l: UserList) => l.id);
              const localOnly = local.filter((l) => !cloudIds.includes(l.id));
              const merged = [...parsed, ...localOnly];
              localStorage.setItem(LISTS_KEY, JSON.stringify(merged));
            }
          } catch {}
        }
        resolve();
      });
    } catch { resolve(); }
  });
}

export const FAVORITES_ID = FAVORITES_LIST_ID;
