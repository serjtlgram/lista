export type Language = 'ru' | 'uk' | 'en' | 'es';

export interface Translations {
  greeting: string;
  what_to_add: string;
  nav_home: string;
  nav_search: string;
  nav_stats: string;
  nav_profile: string;
  categories: {
    movies: string;
    shows: string;
    books: string;
    audiobooks: string;
    podcasts: string;
    games: string;
  };
  profile: {
    title: string;
    language: string;
    theme: string;
    theme_dark: string;
    theme_light: string;
    categories_config: string;
    categories_manage: string;
    min_categories_alert: string;
    app_version: string;
    user_id: string;
  };
  activity: {
    this_month: string;
    added: string;
    spent: string;
    streak: string;
    hours_suffix: string;
  };
  recently_added: {
    title: string;
    see_all: string;
    empty: string;
  };
  modal: {
    save: string;
    cancel: string;
    add_item: string;
    edit_item: string;
    title_placeholder: string;
  };
  category_modal: {
    title: string;
    subtitle: string;
    min_warning: string;
    save: string;
  };
}

export const translations: Record<Language, Translations> = {
  ru: {
    greeting: 'Привет',
    what_to_add: 'Что сегодня добавим?',
    nav_home: 'Главная',
    nav_search: 'Поиск',
    nav_stats: 'Статистика',
    nav_profile: 'Профиль',
    categories: {
      movies: 'Фильмы',
      shows: 'Сериалы',
      books: 'Книги',
      audiobooks: 'Аудиокниги',
      podcasts: 'Подкасты',
      games: 'Игры',
    },
    profile: {
      title: 'Профиль',
      language: 'Язык интерфейса',
      theme: 'Тема оформления',
      theme_dark: 'Тёмная',
      theme_light: 'Светлая',
      categories_config: 'Категории на главном',
      categories_manage: 'Настроить категории',
      min_categories_alert: 'Минимум 2 категории должны быть выбраны!',
      app_version: 'Версия приложения',
      user_id: 'ID пользователя',
    },
    activity: {
      this_month: 'В этом месяце',
      added: 'Добавлено',
      spent: 'Потрачено',
      streak: 'Дней подряд',
      hours_suffix: 'ч',
    },
    recently_added: {
      title: 'Недавно добавленные',
      see_all: 'Все',
      empty: 'Пока ничего не добавлено',
    },
    modal: {
      save: 'Сохранить',
      cancel: 'Отмена',
      add_item: 'Добавить',
      edit_item: 'Редактировать',
      title_placeholder: 'Название...',
    },
    category_modal: {
      title: 'Настройка категорий',
      subtitle: 'Выберите категории для отображения на главном экране (минимум 2)',
      min_warning: 'Должно быть выбрано минимум 2 категории!',
      save: 'Сохранить',
    },
  },
  uk: {
    greeting: 'Привіт',
    what_to_add: 'Що сьогодні додамо?',
    nav_home: 'Головна',
    nav_search: 'Пошук',
    nav_stats: 'Статистика',
    nav_profile: 'Профіль',
    categories: {
      movies: 'Фільми',
      shows: 'Серіали',
      books: 'Книги',
      audiobooks: 'Аудіокниги',
      podcasts: 'Подкасти',
      games: 'Ігри',
    },
    profile: {
      title: 'Профіль',
      language: 'Мова інтерфейсу',
      theme: 'Тема оформления',
      theme_dark: 'Темна',
      theme_light: 'Світла',
      categories_config: 'Категорії на головній',
      categories_manage: 'Налаштувати категорії',
      min_categories_alert: 'Мінімум 2 категорії мають бути обрані!',
      app_version: 'Версія додатка',
      user_id: 'ID користувача',
    },
    activity: {
      this_month: 'У цьому місяці',
      added: 'Додано',
      spent: 'Витрачено',
      streak: 'Днів поспіль',
      hours_suffix: 'г',
    },
    recently_added: {
      title: 'Нещодавно додані',
      see_all: 'Усі',
      empty: 'Поки нічого не додано',
    },
    modal: {
      save: 'Зберегти',
      cancel: 'Скасувати',
      add_item: 'Додати',
      edit_item: 'Редагувати',
      title_placeholder: 'Назва...',
    },
    category_modal: {
      title: 'Налаштування категорій',
      subtitle: 'Оберіть категорії для відображення на головному екрані (мінімум 2)',
      min_warning: 'Має бути обрано щонайменше 2 категорії!',
      save: 'Зберегти',
    },
  },
  en: {
    greeting: 'Hello',
    what_to_add: 'What are we adding today?',
    nav_home: 'Home',
    nav_search: 'Search',
    nav_stats: 'Stats',
    nav_profile: 'Profile',
    categories: {
      movies: 'Movies',
      shows: 'TV Series',
      books: 'Books',
      audiobooks: 'Audiobooks',
      podcasts: 'Podcasts',
      games: 'Games',
    },
    profile: {
      title: 'Profile',
      language: 'Interface Language',
      theme: 'Theme',
      theme_dark: 'Dark',
      theme_light: 'Light',
      categories_config: 'Home Categories',
      categories_manage: 'Customize Categories',
      min_categories_alert: 'At least 2 categories must be selected!',
      app_version: 'App Version',
      user_id: 'User ID',
    },
    activity: {
      this_month: 'This Month',
      added: 'Added',
      spent: 'Spent',
      streak: 'Streak Days',
      hours_suffix: 'h',
    },
    recently_added: {
      title: 'Recently Added',
      see_all: 'See all',
      empty: 'Nothing added yet',
    },
    modal: {
      save: 'Save',
      cancel: 'Cancel',
      add_item: 'Add Item',
      edit_item: 'Edit Item',
      title_placeholder: 'Title...',
    },
    category_modal: {
      title: 'Customize Categories',
      subtitle: 'Select categories to display on the home screen (minimum 2)',
      min_warning: 'At least 2 categories must be selected!',
      save: 'Save',
    },
  },
  es: {
    greeting: 'Hola',
    what_to_add: '¿Qué vamos a añadir hoy?',
    nav_home: 'Inicio',
    nav_search: 'Buscar',
    nav_stats: 'Estadísticas',
    nav_profile: 'Perfil',
    categories: {
      movies: 'Películas',
      shows: 'Series',
      books: 'Libros',
      audiobooks: 'Audiolibros',
      podcasts: 'Pódcasts',
      games: 'Juegos',
    },
    profile: {
      title: 'Perfil',
      language: 'Idioma de la Interfaz',
      theme: 'Tema',
      theme_dark: 'Oscuro',
      theme_light: 'Claro',
      categories_config: 'Categorías Principales',
      categories_manage: 'Personalizar Categorías',
      min_categories_alert: '¡Se deben seleccionar al menos 2 categorías!',
      app_version: 'Versión de la App',
      user_id: 'ID de Usuario',
    },
    activity: {
      this_month: 'Este Mes',
      added: 'Añadidos',
      spent: 'Horas',
      streak: 'Días seguidos',
      hours_suffix: 'h',
    },
    recently_added: {
      title: 'Añadidos Recientemente',
      see_all: 'Ver todo',
      empty: 'Aún no hay elementos',
    },
    modal: {
      save: 'Guardar',
      cancel: 'Cancelar',
      add_item: 'Añadir',
      edit_item: 'Editar',
      title_placeholder: 'Título...',
    },
    category_modal: {
      title: 'Personalizar Categorías',
      subtitle: 'Seleccione las categorías para la pantalla principal (mínimo 2)',
      min_warning: '¡Debe seleccionar al menos 2 categorías!',
      save: 'Guardar',
    },
  },
};

export const getStoredLanguage = (): Language => {
  const stored = localStorage.getItem('lista_language') as Language;
  if (stored && ['ru', 'uk', 'en', 'es'].includes(stored)) {
    return stored;
  }
  return 'ru';
};

export const setStoredLanguage = (lang: Language): void => {
  localStorage.setItem('lista_language', lang);
};

export const getStoredTheme = (): 'dark' | 'light' => {
  const stored = localStorage.getItem('lista_theme');
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  return 'dark';
};

export const setStoredTheme = (theme: 'dark' | 'light'): void => {
  localStorage.setItem('lista_theme', theme);
};

export const DEFAULT_ACTIVE_CATEGORIES = ['Фильмы', 'Сериалы'];

export const getStoredActiveCategories = (): string[] => {
  try {
    const stored = localStorage.getItem('lista_active_categories');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length >= 2) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Error reading active categories:', e);
  }
  return DEFAULT_ACTIVE_CATEGORIES;
};

export const setStoredActiveCategories = (cats: string[]): void => {
  localStorage.setItem('lista_active_categories', JSON.stringify(cats));
};
