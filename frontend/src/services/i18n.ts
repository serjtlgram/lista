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
    movie_single: string;
    show_single: string;
    book_single: string;
    audiobook_single: string;
    podcast_single: string;
    game_single: string;
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
    title_label: string;
    title_placeholder: string;
    category_label: string;
    status_label: string;
    rating_label: string;
    status_watching: string;
    status_completed: string;
    status_planned: string;
    advanced_show: string;
    advanced_hide: string;
    placeholder_genre: string;
    placeholder_duration: string;
    placeholder_year: string;
    placeholder_poster: string;
    placeholder_note: string;
  };
  category_modal: {
    title: string;
    subtitle: string;
    min_warning: string;
    save: string;
  };
  details: {
    my_rating: string;
    watch_date: string;
    genre: string;
    duration: string;
    notes: string;
    add_to_list: string;
    edit: string;
    share: string;
    delete: string;
    search_placeholder: string;
    elements_count: string;
    by_date: string;
    no_items_found: string;
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
      movie_single: 'Фильм',
      show_single: 'Сериал',
      book_single: 'Книга',
      audiobook_single: 'Аудиокнига',
      podcast_single: 'Подкаст',
      game_single: 'Игра',
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
      add_item: 'Добавить запись',
      edit_item: 'Редактировать запись',
      title_label: 'Название',
      title_placeholder: 'Название (например, Дюна 2)',
      category_label: 'Категория',
      status_label: 'Статус',
      rating_label: 'Оценка',
      status_watching: 'Смотрю/Читаю',
      status_completed: 'Завершено',
      status_planned: 'В планах',
      advanced_show: '+ Добавить жанр, год, постер и заметки',
      advanced_hide: 'Скрыть дополнительные поля',
      placeholder_genre: 'Жанр (например, Фантастика, Драма)',
      placeholder_duration: 'Длительность (2ч 30м / 1 season)',
      placeholder_year: 'Год вып. (2024)',
      placeholder_poster: 'Ссылка на обложку (Poster Image URL)',
      placeholder_note: 'Заметка или впечатления...',
    },
    category_modal: {
      title: 'Настройка категорий',
      subtitle: 'Выберите категории для отображения на главном экране (минимум 2)',
      min_warning: 'Должно быть выбрано минимум 2 категории!',
      save: 'Сохранить',
    },
    details: {
      my_rating: 'Моя оценка',
      watch_date: 'Дата просмотра',
      genre: 'Жанр',
      duration: 'Длительность',
      notes: 'Заметки',
      add_to_list: 'В список',
      edit: 'Изменить',
      share: 'Поделиться',
      delete: 'Удалить',
      search_placeholder: 'Поиск по названию или жанру...',
      elements_count: 'элементов',
      by_date: 'По дате',
      no_items_found: 'Ничего не найдено в этой категории',
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
      movie_single: 'Фільм',
      show_single: 'Серіал',
      book_single: 'Книга',
      audiobook_single: 'Аудіокнига',
      podcast_single: 'Подкаст',
      game_single: 'Гра',
    },
    profile: {
      title: 'Профіль',
      language: 'Мова інтерфейсу',
      theme: 'Тема оформлення',
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
      add_item: 'Додати запис',
      edit_item: 'Редагувати запис',
      title_label: 'Назва',
      title_placeholder: 'Назва (наприклад, Дюна 2)',
      category_label: 'Категорія',
      status_label: 'Статус',
      rating_label: 'Оцінка',
      status_watching: 'Дивлюсь/Читаю',
      status_completed: 'Завершено',
      status_planned: 'У планах',
      advanced_show: '+ Додати жанр, рік, постер та нотатки',
      advanced_hide: 'Сховати додаткові поля',
      placeholder_genre: 'Жанр (наприклад, Фантастика, Драма)',
      placeholder_duration: 'Тривалість (2г 30хв / 1 сезон)',
      placeholder_year: 'Рік вип. (2024)',
      placeholder_poster: 'Посилання на обкладинку (Poster URL)',
      placeholder_note: 'Нотатка або враження...',
    },
    category_modal: {
      title: 'Налаштування категорій',
      subtitle: 'Оберіть категорії для відображення на головному екрані (мінімум 2)',
      min_warning: 'Має бути обрано щонайменше 2 категорії!',
      save: 'Зберегти',
    },
    details: {
      my_rating: 'Моя оцінка',
      watch_date: 'Дата перегляду',
      genre: 'Жанр',
      duration: 'Тривалість',
      notes: 'Нотатки',
      add_to_list: 'До списку',
      edit: 'Змінити',
      share: 'Поділитися',
      delete: 'Видалити',
      search_placeholder: 'Пошук за назвою або жанром...',
      elements_count: 'елементів',
      by_date: 'За датою',
      no_items_found: 'Нічого не знайдено в цій категорії',
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
      movie_single: 'Movie',
      show_single: 'TV Series',
      book_single: 'Book',
      audiobook_single: 'Audiobook',
      podcast_single: 'Podcast',
      game_single: 'Game',
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
      add_item: 'Add Record',
      edit_item: 'Edit Record',
      title_label: 'Title',
      title_placeholder: 'Title (e.g. Dune 2)',
      category_label: 'Category',
      status_label: 'Status',
      rating_label: 'Rating',
      status_watching: 'Watching/Reading',
      status_completed: 'Completed',
      status_planned: 'Planned',
      advanced_show: '+ Add genre, year, poster and notes',
      advanced_hide: 'Hide additional fields',
      placeholder_genre: 'Genre (e.g. Sci-Fi, Drama)',
      placeholder_duration: 'Duration (2h 30m / 1 season)',
      placeholder_year: 'Release year (2024)',
      placeholder_poster: 'Poster image URL',
      placeholder_note: 'Note or impressions...',
    },
    category_modal: {
      title: 'Customize Categories',
      subtitle: 'Select categories to display on the home screen (minimum 2)',
      min_warning: 'At least 2 categories must be selected!',
      save: 'Save',
    },
    details: {
      my_rating: 'My Rating',
      watch_date: 'Watch Date',
      genre: 'Genre',
      duration: 'Duration',
      notes: 'Notes',
      add_to_list: 'Add to list',
      edit: 'Edit',
      share: 'Share',
      delete: 'Delete',
      search_placeholder: 'Search by title or genre...',
      elements_count: 'items',
      by_date: 'By date',
      no_items_found: 'Nothing found in this category',
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
      movie_single: 'Película',
      show_single: 'Serie',
      book_single: 'Libro',
      audiobook_single: 'Audiolibro',
      podcast_single: 'Pódcast',
      game_single: 'Juego',
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
      add_item: 'Añadir Registro',
      edit_item: 'Editar Registro',
      title_label: 'Título',
      title_placeholder: 'Título (ej. Duna 2)',
      category_label: 'Categoría',
      status_label: 'Estado',
      rating_label: 'Puntuación',
      status_watching: 'Viendo/Leyendo',
      status_completed: 'Completado',
      status_planned: 'En planes',
      advanced_show: '+ Añadir género, año, póster y notas',
      advanced_hide: 'Ocultar campos adicionales',
      placeholder_genre: 'Género (ej. Ciencia ficción, Drama)',
      placeholder_duration: 'Duración (2h 30m / 1 temporada)',
      placeholder_year: 'Año de lanzamiento (2024)',
      placeholder_poster: 'URL de la imagen del póster',
      placeholder_note: 'Nota o impresiones...',
    },
    category_modal: {
      title: 'Personalizar Categorías',
      subtitle: 'Seleccione las categorías para la pantalla principal (mínimo 2)',
      min_warning: '¡Debe seleccionar al menos 2 categorías!',
      save: 'Guardar',
    },
    details: {
      my_rating: 'Mi Puntuación',
      watch_date: 'Fecha de visualización',
      genre: 'Género',
      duration: 'Duración',
      notes: 'Notas',
      add_to_list: 'A la lista',
      edit: 'Editar',
      share: 'Compartir',
      delete: 'Eliminar',
      search_placeholder: 'Buscar por título o género...',
      elements_count: 'elementos',
      by_date: 'Por fecha',
      no_items_found: 'No se encontró nada en esta categoría',
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
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.CloudStorage) {
      tg.CloudStorage.setItem('lista_language', lang, (err: any) => {
        if (err) console.warn('CloudStorage setLanguage error:', err);
      });
    }
  } catch (e) {
    console.warn('CloudStorage setLanguage exception:', e);
  }
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
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.CloudStorage) {
      tg.CloudStorage.setItem('lista_theme', theme, (err: any) => {
        if (err) console.warn('CloudStorage setTheme error:', err);
      });
    }
  } catch (e) {
    console.warn('CloudStorage setTheme exception:', e);
  }
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
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.CloudStorage) {
      tg.CloudStorage.setItem('lista_active_categories', JSON.stringify(cats), (err: any) => {
        if (err) console.warn('CloudStorage setActiveCategories error:', err);
      });
    }
  } catch (e) {
    console.warn('CloudStorage setActiveCategories exception:', e);
  }
};
