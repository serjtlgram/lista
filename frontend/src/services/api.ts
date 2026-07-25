import { Item, UserProfile, StatsData } from '../types';

// API Base URL for Oracle Server "Andrey"
const API_BASE = import.meta.env.VITE_API_URL || 'http://129.151.217.58';

const getHeaders = () => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const tg = (window as any).Telegram?.WebApp;
  if (tg?.initData) {
    headers['X-Telegram-Init-Data'] = tg.initData;
  } else {
    // Fallback header for testing in browser outside Telegram
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
      console.warn('API getProfile fallback:', e);
      return {
        user: { id: 1001, username: 'anna_tg', first_name: 'Анна', last_name: '', photo_url: '' },
        total_items: 329,
        completed_count: 240,
        watching_count: 45,
        current_streak: 5,
        monthly_count: 9,
        monthly_hours: 18,
        categories: [
          { category: 'Фильмы', count: 128 },
          { category: 'Сериалы', count: 64 },
          { category: 'Книги', count: 87 },
          { category: 'Аудиокниги', count: 23 },
          { category: 'Подкасты', count: 12 },
          { category: 'Игры', count: 15 },
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
      console.warn('API getItems fallback:', e);
      return mockItems;
    }
  },

  async createItem(item: Partial<Item>): Promise<Item> {
    try {
      const res = await fetch(`${API_BASE}/api/items`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(item),
      });
      if (!res.ok) throw new Error('Failed to create item');
      return await res.json();
    } catch (e) {
      console.warn('API createItem fallback:', e);
      return {
        id: 'mock-' + Date.now(),
        title: item.title || 'Новая запись',
        category: item.category || 'movie',
        status: item.status || 'planned',
        rating: item.rating || 8,
        genre: item.genre || 'Драма',
        duration: item.duration || '2ч',
        release_year: item.release_year || '2024',
        poster_url: item.poster_url || 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=150&auto=format&fit=crop&q=80',
        note: item.note || '',
        raw_input: item.raw_input || '',
      };
    }
  },

  async updateItem(id: string, updates: Partial<Item>): Promise<void> {
    try {
      await fetch(`${API_BASE}/api/items/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(updates),
      });
    } catch (e) {
      console.warn('API updateItem fallback:', e);
    }
  },

  async deleteItem(id: string): Promise<void> {
    try {
      await fetch(`${API_BASE}/api/items/${id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
    } catch (e) {
      console.warn('API deleteItem fallback:', e);
    }
  },

  async getStats(): Promise<StatsData> {
    try {
      const res = await fetch(`${API_BASE}/api/stats`, { headers: getHeaders() });
      if (!res.ok) throw new Error('Failed to fetch stats');
      return await res.json();
    } catch (e) {
      console.warn('API getStats fallback:', e);
      return {
        total_items: 329,
        completed_items: 240,
        total_hours: 48,
        monthly_added: 18,
        growth_percentage: 12.5,
        category_percentage: { 'Фильмы': 35, 'Сериалы': 30, 'Книги': 20, 'Другое': 15 },
        weekly_activity: [40, 65, 30, 85, 100, 50, 75]
      };
    }
  }
};

const mockItems: Item[] = [
  {
    id: '1',
    title: 'Дюна: Часть вторая',
    category: 'Фильмы',
    status: 'completed',
    rating: 10,
    genre: 'Фантастика, Приключения',
    duration: '2ч 46м',
    release_year: '2024',
    poster_url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80',
    note: 'Потрясающая визуальная часть и музыка. Особенно впечатлили сцены на Арракисе.',
  },
  {
    id: '2',
    title: 'Сёгун',
    category: 'Сериалы',
    status: 'watching',
    rating: 10,
    genre: 'Исторический, Драма',
    duration: '1 сезон',
    release_year: '2024',
    poster_url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
    note: 'Завораживающая атмосфера феодальной Японии.',
  },
  {
    id: '3',
    title: '1984',
    category: 'Книги',
    status: 'completed',
    rating: 9,
    genre: 'Антиутопия',
    duration: '328 стр',
    release_year: '1949',
    poster_url: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80',
    note: 'Великая классика про тоталитаризм.',
  },
  {
    id: '4',
    title: 'Во все тяжкие',
    category: 'Сериалы',
    status: 'completed',
    rating: 10,
    genre: 'Криминал, Драма',
    duration: '5 сезонов',
    release_year: '2008–2013',
    poster_url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80',
    note: 'Шедевр кинематографа.',
  },
  {
    id: '5',
    title: 'Игра престолов',
    category: 'Сериалы',
    status: 'completed',
    rating: 10,
    genre: 'Фэнтези, Драма',
    duration: '8 сезонов',
    release_year: '2011–2019',
    poster_url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80',
    note: 'Легендарное фэнтези.',
  },
  {
    id: '6',
    title: 'Тьма',
    category: 'Сериалы',
    status: 'completed',
    rating: 10,
    genre: 'Фантастика, Детектив',
    duration: '3 сезона',
    release_year: '2017–2020',
    poster_url: 'https://images.unsplash.com/photo-1509114397022-ed747cca3f65?w=600&auto=format&fit=crop&q=80',
    note: 'Самый умный сериал про путешествия во времени.',
  },
  {
    id: '7',
    title: 'Настоящий детектив',
    category: 'Сериалы',
    status: 'planned',
    rating: 8,
    genre: 'Детектив, Триллер',
    duration: '4 сезона',
    release_year: '2014–...',
    poster_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
    note: 'Первый сезон невероятный.',
  }
];
