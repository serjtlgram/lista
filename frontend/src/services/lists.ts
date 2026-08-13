// lists.ts — Lists & Folders management service
// Stores user-created lists & folders in localStorage, syncs with Telegram CloudStorage
import { saveToCloudStorage, loadFromCloudStorage } from './cloud';
import { api } from './api';

export interface ListFolder {
  id: string;
  name: string;
  icon?: string;
  isDefault?: boolean;
  createdAt?: string;
}

export interface UserList {
  id: string;
  name: string;
  isDefault: boolean; // true for "Favorites" — cannot delete or rename
  itemIds: string[];
  createdAt: string;
  folderId?: string; // ID of the folder it belongs to. Defaults to 'misc'
}

const LISTS_KEY = 'lista_user_lists';
const LISTS_TS_KEY = 'lista_user_lists_ts';
const FOLDERS_KEY = 'lista_list_folders';
const FOLDERS_TS_KEY = 'lista_list_folders_ts';

const FAVORITES_LIST_ID = 'favorites';
export const UNCATEGORIZED_ID = 'uncategorized';
export const DEFAULT_FOLDER_ID = 'misc';

export const DEFAULT_FOLDERS: ListFolder[] = [
  { id: 'svoe', name: 'Своё', isDefault: true, icon: '🏠' },
  { id: 'foreign', name: 'Зарубежное', isDefault: true, icon: '🌍' },
  { id: 'misc', name: 'Разное', isDefault: true, icon: '📂' },
];

function getDefaultFavoritesList(): UserList {
  return {
    id: FAVORITES_LIST_ID,
    name: 'Избранное',
    isDefault: true,
    itemIds: [],
    createdAt: new Date().toISOString(),
    folderId: DEFAULT_FOLDER_ID,
  };
}

export function getFolders(): ListFolder[] {
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    if (!raw) return DEFAULT_FOLDERS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_FOLDERS;

    return parsed;
  } catch {
    return DEFAULT_FOLDERS;
  }
}

export function saveFolders(folders: ListFolder[]): void {
  const timestamp = Date.now().toString();
  try {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
    localStorage.setItem(FOLDERS_TS_KEY, timestamp);
  } catch (e) {
    console.warn('localStorage saveFolders error:', e);
  }

  window.dispatchEvent(new Event('lista_folders_updated'));

  saveToCloudStorage(FOLDERS_KEY, JSON.stringify(folders));
  saveToCloudStorage(FOLDERS_TS_KEY, timestamp);

  api.syncListsData(getLists(), folders);
}

export function createFolder(name: string, icon?: string): ListFolder {
  const folders = getFolders();
  const newFolder: ListFolder = {
    id: 'folder_' + Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5),
    name: name.trim(),
    icon: icon || '📁',
    createdAt: new Date().toISOString(),
  };
  folders.push(newFolder);
  saveFolders(folders);
  return newFolder;
}

export function renameFolder(folderId: string, newName: string, newIcon?: string): void {
  const folders = getFolders();
  const updated = folders.map((f) => {
    if (f.id === folderId) {
      return { ...f, name: newName.trim(), icon: newIcon || f.icon || '📁' };
    }
    return f;
  });
  saveFolders(updated);
}

export function deleteFolder(folderId: string): void {
  const folders = getFolders();
  const updated = folders.filter((f) => f.id !== folderId);
  saveFolders(updated);

  // Move lists inside deleted folder to 'all' (remove folderId)
  const lists = getLists();
  const updatedLists = lists.map((l) => (l.folderId === folderId ? { ...l, folderId: undefined } : l));
  saveLists(updatedLists);
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

  api.syncListsData(lists, getFolders());
}

export function createList(name: string, folderId?: string): UserList {
  const lists = getLists();
  const newList: UserList = {
    id: crypto.randomUUID ? crypto.randomUUID() : `list_${Date.now()}`,
    name,
    isDefault: false,
    itemIds: [],
    createdAt: new Date().toISOString(),
    folderId: folderId || DEFAULT_FOLDER_ID,
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

export function updateListFolder(listId: string, folderId: string): void {
  const lists = getLists();
  const updated = lists.map((l) =>
    l.id === listId && !l.isDefault ? { ...l, folderId } : l
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
  const backendData = await api.getListsData();

  if (backendData) {
    const isBackendEmpty = (!backendData.lists || backendData.lists.length === 0) && (!backendData.folders || backendData.folders.length === 0);

    if (isBackendEmpty) {
      // 1. Initial migration: push local data to empty backend
      const localFolders = getFolders();
      const localLists = getLists();
      api.syncListsData(localLists, localFolders);
    } else {
      // 2. Backend is the single source of truth. Overwrite local storage.
      let backendFolders = backendData.folders;
      if (!backendFolders || backendFolders.length === 0) {
        backendFolders = DEFAULT_FOLDERS;
      }

      let backendLists = backendData.lists || [];
      if (!backendLists.some((l: UserList) => l.id === FAVORITES_ID)) {
        backendLists = [getDefaultFavoritesList(), ...backendLists];
      }

      const ts = Date.now().toString();

      localStorage.setItem(FOLDERS_KEY, JSON.stringify(backendFolders));
      localStorage.setItem(FOLDERS_TS_KEY, ts);
      window.dispatchEvent(new Event('lista_folders_updated'));

      localStorage.setItem(LISTS_KEY, JSON.stringify(backendLists));
      localStorage.setItem(LISTS_TS_KEY, ts);
      window.dispatchEvent(new Event('lista_lists_updated'));

      // Keep CloudStorage somewhat in sync for legacy clients, though unused by new logic
      saveToCloudStorage(FOLDERS_KEY, JSON.stringify(backendFolders));
      saveToCloudStorage(LISTS_KEY, JSON.stringify(backendLists));
    }
  } else {
    console.warn('syncListsFromCloud: failed to fetch from backend, skipping sync');
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

