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
  try {
    localStorage.setItem(LISTS_KEY, JSON.stringify(lists));
  } catch (e) {
    console.warn('localStorage saveLists error:', e);
  }

  // Dispatch event for UI reactivity
  window.dispatchEvent(new Event('lista_lists_updated'));

  saveToCloudStorage(LISTS_KEY, JSON.stringify(lists));
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
  if (val) {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) {
        const local = getLists();
        const cloudMap = new Map<string, UserList>();
        parsed.forEach((l: UserList) => cloudMap.set(l.id, l));

        const merged: UserList[] = [];

        // Merge cloud lists with local items
        cloudMap.forEach((cloudList, id) => {
          const localList = local.find((l) => l.id === id);
          if (localList) {
            const combinedItemIds = Array.from(
              new Set([...(cloudList.itemIds || []), ...(localList.itemIds || [])])
            );
            merged.push({
              ...cloudList,
              name: cloudList.name || localList.name,
              itemIds: combinedItemIds,
            });
          } else {
            merged.push(cloudList);
          }
        });

        // Keep local-only lists
        local.forEach((localList) => {
          if (!cloudMap.has(localList.id)) {
            merged.push(localList);
          }
        });

        localStorage.setItem(LISTS_KEY, JSON.stringify(merged));
        saveToCloudStorage(LISTS_KEY, JSON.stringify(merged));
        window.dispatchEvent(new Event('lista_lists_updated'));
      }
    } catch (e) {
      console.warn('Error parsing cloud lists:', e);
    }
  }
}

export const FAVORITES_ID = FAVORITES_LIST_ID;
