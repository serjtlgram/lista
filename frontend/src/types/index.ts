export type CategoryType = 'movie' | 'show' | 'book' | 'audiobook' | 'podcast' | 'game' | 'Фильмы' | 'Сериалы' | 'Книги' | 'Аудиокниги' | 'Подкасты' | 'Игры';
export type StatusType = 'watching' | 'completed' | 'planned' | 'paused' | 'Смотрю' | 'Просмотрено' | 'Отложено';

export interface Item {
  id: string;
  user_id?: number;
  title: string;
  category: string;
  status: string;
  rating: number; // 0..10
  genre?: string;
  duration?: string;
  release_year?: string;
  poster_url?: string;
  description?: string;
  note?: string;
  raw_input?: string;
  ai_parsed?: boolean;
  youtube_url?: string;
  episodes?: number;
  director?: string;
  cast?: string;
  started_at?: string;
  completed_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CatalogItem {
  id?: string;
  title: string;
  category: string;
  genre?: string;
  duration?: string;
  release_year?: string;
  poster_url?: string;
  description?: string;
  youtube_url?: string;
  director?: string;
  cast?: string;
  source?: string;
}

export interface User {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  photo_url: string;
  language_code?: string;
  is_premium?: boolean;
  allows_write_to_pm?: boolean;
  visits_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface UserProfile {
  user: User;
  total_items: number;
  completed_count: number;
  watching_count: number;
  current_streak: number;
  monthly_count: number;
  monthly_hours: number;
  categories: { category: string; count: number }[];
}

export interface StatsData {
  total_items: number;
  completed_items: number;
  total_hours: number;
  monthly_added: number;
  growth_percentage: number;
  category_percentage: Record<string, number>;
  weekly_activity: number[];
}
