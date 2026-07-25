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
