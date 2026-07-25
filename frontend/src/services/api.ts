import { Item, UserProfile, StatsData } from '../types';

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
          { category: 'Аудиокниги', count: 0 },
          { category: 'Подкасты', count: 0 },
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
    const res = await fetch(`${API_BASE}/api/items`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(item),
    });
    if (!res.ok) throw new Error('Failed to create item');
    return await res.json();
  },

  async updateItem(id: string, updates: Partial<Item>): Promise<void> {
    await fetch(`${API_BASE}/api/items/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(updates),
    });
  },

  async deleteItem(id: string): Promise<void> {
    await fetch(`${API_BASE}/api/items/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
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
};
