export type SyncActionType = 'CREATE' | 'UPDATE' | 'DELETE';

export interface SyncAction {
  id: string;
  type: SyncActionType;
  itemId: string;
  payload?: any;
  timestamp: number;
  executor?: string; // not serializable, runtime-only
}

const SYNC_QUEUE_KEY = 'lista_sync_queue';
const ID_MAP_KEY = 'lista_id_map';

// Runtime executor registry: actionId -> executor fn
const executorRegistry = new Map<string, (action: SyncAction) => Promise<any>>();

let isProcessing = false;

export const getSyncQueue = (): SyncAction[] => {
  try {
    const data = localStorage.getItem(SYNC_QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const saveSyncQueue = (queue: SyncAction[]) => {
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
};

export const getIdMap = (): Record<string, string> => {
  try {
    const data = localStorage.getItem(ID_MAP_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
};

export const saveIdMap = (map: Record<string, string>) => {
  localStorage.setItem(ID_MAP_KEY, JSON.stringify(map));
};

const resolveIds = (action: SyncAction, idMap: Record<string, string>): SyncAction => {
  const resolvedAction = { ...action };
  if (idMap[action.itemId]) {
    resolvedAction.itemId = idMap[action.itemId];
  }
  return resolvedAction;
};

export type FetchExecutor = (action: SyncAction) => Promise<any>;

export const processSyncQueue = async () => {
  if (isProcessing) return;
  isProcessing = true;

  try {
    let queue = getSyncQueue();
    let idMap = getIdMap();

    while (queue.length > 0) {
      const rawAction = queue[0];
      const executor = executorRegistry.get(rawAction.id);

      // If no executor for this action (e.g. page was reloaded), skip it
      if (!executor) {
        queue.shift();
        saveSyncQueue(queue);
        queue = getSyncQueue();
        continue;
      }

      const action = resolveIds(rawAction, idMap);

      try {
        const response = await executor(action);

        if (action.type === 'CREATE' && response && response.id) {
          idMap[action.itemId] = response.id;
          saveIdMap(idMap);

          window.dispatchEvent(new CustomEvent('ListaItemCreated', {
            detail: { tempId: action.itemId, realId: response.id, serverItem: response }
          }));
        }

        executorRegistry.delete(rawAction.id);
        queue = getSyncQueue();
        queue.shift();
        saveSyncQueue(queue);
        queue = getSyncQueue();

      } catch (error: any) {
        console.warn('Sync queue network error, will retry later:', error);
        break;
      }
    }
  } finally {
    isProcessing = false;
  }
};

export const enqueueAction = (
  type: SyncActionType,
  itemId: string,
  payload?: any,
  executor?: FetchExecutor
) => {
  const actionId = `action_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  const queue = getSyncQueue();
  queue.push({
    id: actionId,
    type,
    itemId,
    payload,
    timestamp: Date.now(),
  });
  saveSyncQueue(queue);

  if (executor) {
    executorRegistry.set(actionId, executor);
    processSyncQueue();
  }
};

// Purge orphaned UPDATE/DELETE actions from localStorage on startup
// (they have no executor since page was reloaded and can't be retried)
export const purgeOrphanedQueue = () => {
  const queue = getSyncQueue();
  const filtered = queue.filter(a => a.type === 'CREATE');
  if (filtered.length !== queue.length) {
    saveSyncQueue(filtered);
  }
};
