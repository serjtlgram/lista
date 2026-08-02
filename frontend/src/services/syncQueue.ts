import { Item } from '../types';

export type SyncActionType = 'CREATE' | 'UPDATE' | 'DELETE';

export interface SyncAction {
  id: string; // unique action ID
  type: SyncActionType;
  itemId: string; // target item ID
  payload?: any;
  timestamp: number;
}

const SYNC_QUEUE_KEY = 'lista_sync_queue';
const ID_MAP_KEY = 'lista_id_map'; // map temp IDs to real IDs

let isProcessing = false;

// Get queue
export const getSyncQueue = (): SyncAction[] => {
  try {
    const data = localStorage.getItem(SYNC_QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

// Save queue
const saveSyncQueue = (queue: SyncAction[]) => {
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
};

// Get ID map
export const getIdMap = (): Record<string, string> => {
  try {
    const data = localStorage.getItem(ID_MAP_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
};

// Save ID map
export const saveIdMap = (map: Record<string, string>) => {
  localStorage.setItem(ID_MAP_KEY, JSON.stringify(map));
};

// Replace temporary IDs with real IDs in the payload or itemId
const resolveIds = (action: SyncAction, idMap: Record<string, string>): SyncAction => {
  const resolvedAction = { ...action };
  if (idMap[action.itemId]) {
    resolvedAction.itemId = idMap[action.itemId];
  }
  return resolvedAction;
};

// Define the fetch executor type
export type FetchExecutor = (action: SyncAction) => Promise<any>;

// Background processor
export const processSyncQueue = async (executor: FetchExecutor) => {
  if (isProcessing) return;
  isProcessing = true;

  try {
    let queue = getSyncQueue();
    let idMap = getIdMap();

    while (queue.length > 0) {
      const action = resolveIds(queue[0], idMap);

      try {
        const response = await executor(action);

        // If it was a CREATE action, we must update the ID map
        if (action.type === 'CREATE' && response && response.id) {
          idMap[action.itemId] = response.id;
          saveIdMap(idMap);

          // Dispatch event to update the UI
          window.dispatchEvent(new CustomEvent('ListaItemCreated', {
            detail: { tempId: action.itemId, realId: response.id, serverItem: response }
          }));
        }

        // Remove the processed item from the queue
        queue = getSyncQueue(); // re-fetch in case it changed
        queue.shift();
        saveSyncQueue(queue);

      } catch (error: any) {
        // If it's a network error, stop processing and retry later
        console.warn('Sync queue network error, will retry later:', error);
        break; 
      }
    }
  } finally {
    isProcessing = false;
  }
};

// Enqueue action
export const enqueueAction = (type: SyncActionType, itemId: string, payload?: any, executor?: FetchExecutor) => {
  const queue = getSyncQueue();
  queue.push({
    id: `action_${Date.now()}_${Math.random().toString(36).substring(2)}`,
    type,
    itemId,
    payload,
    timestamp: Date.now()
  });
  saveSyncQueue(queue);

  if (executor) {
    // Attempt processing immediately
    processSyncQueue(executor);
  }
};
