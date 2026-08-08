import { Item, UserProfile, StatsData, CatalogItem } from '../types';
import { enqueueAction, SyncAction, purgeOrphanedQueue } from './syncQueue';

const API_BASE = import.meta.env.VITE_API_URL || 'https://129.151.217.58.nip.io';

const getHeaders = () => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const tg = (window as any).Telegram?.WebApp;
  if (tg?.initData) {
    headers['X-Telegram-Init-Data'] = tg.initData;
  } else {
    headers['X-Test-User-ID'] = '1001';
  }

  return headers;
};

export const api = {
  async getProfile(): Promise<UserProfile> {
    try {
      const res = await fetch(`${API_BASE}/api/user/profile`, { headers: getHeaders() });
      if (!res.ok) throw new Error('Failed to fetch profile');
      return await res.json();
    } catch (e) {
      console.warn('API getProfile error, returning empty profile:', e);
      return {
        user: { id: 1001, username: '', first_name: 'Пользователь', last_name: '', photo_url: '' },
        total_items: 0,
        completed_count: 0,
        watching_count: 0,
        current_streak: 0,
        monthly_count: 0,
        monthly_hours: 0,
        categories: [
          { category: 'Фильмы', count: 0 },
          { category: 'Сериалы', count: 0 },
          { category: 'Книги', count: 0 },
          { category: 'Игры', count: 0 },
        ]
      };
    }
  },

  async getItems(category?: string, status?: string, query?: string): Promise<Item[]> {
    try {
      const params = new URLSearchParams();
      if (category && category !== 'Все') params.append('category', category);
      if (status && status !== 'Все') params.append('status', status);
      if (query) params.append('q', query);

      const res = await fetch(`${API_BASE}/api/items?${params.toString()}`, { headers: getHeaders() });
      if (!res.ok) throw new Error('Failed to fetch items');
      return await res.json();
    } catch (e) {
      console.warn('API getItems error, returning empty list:', e);
      return [];
    }
  },

  async createItem(item: Partial<Item>): Promise<Item> {
    // Purge orphaned UPDATE/DELETE from previous sessions first
    purgeOrphanedQueue();

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const mockedItem = { ...item, id: tempId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as Item;
    
    enqueueAction('CREATE', tempId, item, async (action: SyncAction) => {
      const res = await fetch(`${API_BASE}/api/items`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(action.payload),
      });
      if (!res.ok) throw new Error('Failed to create item');
      return await res.json();
    });

    return mockedItem;
  },

  async updateItem(id: string, updates: Partial<Item>): Promise<void> {
    // Direct fetch for UPDATE - no queue needed (idempotent, real ID always known)
    try {
      const res = await fetch(`${API_BASE}/api/items/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        console.warn(`UpdateItem failed for ${id}:`, res.status, await res.text().catch(() => ''));
      }
    } catch (e) {
      console.warn('UpdateItem network error:', e);
    }
  },

  async deleteItem(id: string): Promise<void> {
    // Direct fetch for DELETE - no queue needed
    try {
      const res = await fetch(`${API_BASE}/api/items/${id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (!res.ok) {
        console.warn(`DeleteItem failed for ${id}:`, res.status);
      }
    } catch (e) {
      console.warn('DeleteItem network error:', e);
    }
  },

  async getStats(): Promise<StatsData> {
    try {
      const res = await fetch(`${API_BASE}/api/stats`, { headers: getHeaders() });
      if (!res.ok) throw new Error('Failed to fetch stats');
      return await res.json();
    } catch (e) {
      console.warn('API getStats error:', e);
      return {
        total_items: 0,
        completed_items: 0,
        total_hours: 0,
        monthly_added: 0,
        growth_percentage: 0,
        category_percentage: { 'Фильмы': 0, 'Сериалы': 0, 'Книги': 0, 'Другое': 0 },
        weekly_activity: [0, 0, 0, 0, 0, 0, 0]
      };
    }
  },

  async searchCatalog(query: string, category?: string): Promise<any[]> {
    try {
      if (!query || query.length < 2) return [];
      const params = new URLSearchParams({ q: query });
      if (category) params.append('category', category);

      const res = await fetch(`${API_BASE}/api/catalog/search?${params.toString()}`, { headers: getHeaders() });
      if (!res.ok) return [];
      return await res.json();
    } catch (e) {
      console.warn('API searchCatalog error:', e);
      return [];
    }
  },

  async searchYouTube(title: string, category?: string): Promise<string> {
    try {
      if (!title) return '';
      const params = new URLSearchParams({ q: title });
      if (category) params.append('category', category);

      const res = await fetch(`${API_BASE}/api/youtube/search?${params.toString()}`, { headers: getHeaders() });
      if (!res.ok) return '';
      const data = await res.json();
      return data.youtube_url || '';
    } catch (e) {
      console.warn('API searchYouTube error:', e);
      return '';
    }
  },

  async getPublicItem(id: string): Promise<Item | null> {
    try {
      const res = await fetch(`${API_BASE}/api/public/items/${id}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn('API getPublicItem error:', e);
      return null;
    }
  },

  async createSharedList(title: string, items: Item[]): Promise<string | null> {
    try {
      const res = await fetch(`${API_BASE}/api/public/shared_lists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, items }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.id || null;
    } catch (e) {
      console.warn('API createSharedList error:', e);
      return null;
    }
  },

  async getSharedList(id: string): Promise<{ title: string; items: Item[] } | null> {
    try {
      const res = await fetch(`${API_BASE}/api/public/shared_lists/${id}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn('API getSharedList error:', e);
      return null;
    }
  },

  async getRecommendations(
    listId: string,
    itemIds?: string[],
    itemTitles?: string[],
    category?: string,
    title?: string
  ): Promise<CatalogItem[]> {
    try {
      const body = {
        item_ids: itemIds && itemIds.length > 0 ? itemIds.join(',') : '',
        item_titles: itemTitles && itemTitles.length > 0 ? itemTitles.join('|') : '',
        category: category || '',
        title: title || ''
      };

      const res = await fetch(`${API_BASE}/api/lists/${listId}/recommendations`, {
        method: 'POST',
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return data;
        }
      }
    } catch (e) {
      console.warn('API getRecommendations backend fetch error:', e);
    }

    return [];
  },
};
