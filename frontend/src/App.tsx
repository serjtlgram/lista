import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';

import { Header } from './components/Header';
import { CategoryGrid } from './components/CategoryGrid';
import { ActivityCard } from './components/ActivityCard';
import { RecentlyAdded } from './components/RecentlyAdded';
import { FavoritesSection } from './components/FavoritesSection';
import { CategoryScreen } from './components/CategoryScreen';
import { DetailsScreen } from './components/DetailsScreen';
import { ListsScreen } from './components/ListsScreen';
import { SharedListModal } from './components/SharedListModal';
import { StatsScreen } from './components/StatsScreen';
import { ProfileScreen } from './components/ProfileScreen';
import { CategorySelectModal } from './components/CategorySelectModal';
import { AddItemModal } from './components/AddItemModal';
import { Navbar } from './components/Navbar';

import { api } from './services/api';
import { getTranslatedGenreFull } from './services/genres';
import { getFavoriteIds, syncFavoritesFromCloud } from './services/favorites';
import { syncListsFromCloud } from './services/lists';
import { Item, UserProfile, StatsData } from './types';
import {
  Language,
  translations,
  getStoredLanguage,
  setStoredLanguage,
  getStoredTheme,
  setStoredTheme,
  getStoredActiveCategories,
  setStoredActiveCategories,
} from './services/i18n';

export function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'search' | 'lists' | 'stats' | 'profile' | 'details'>('home');
  const [previousTab, setPreviousTab] = useState<'home' | 'search' | 'lists' | 'stats' | 'profile'>('home');
  const [savedScrollPosition, setSavedScrollPosition] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Все');
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);

  const [language, setLanguage] = useState<Language>(getStoredLanguage());
  const [theme, setTheme] = useState<string>(getStoredTheme());
  const [activeCategories, setActiveCategories] = useState<string[]>(getStoredActiveCategories());

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  const [sharedListModalData, setSharedListModalData] = useState<{ title: string; items: Item[] } | null>(null);
  const [targetListIdToOpen, setTargetListIdToOpen] = useState<string | undefined>(undefined);
  const [selectedListId, setSelectedListId] = useState<string>('favorites');

  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
    return !!(window as any).Telegram?.WebApp?.isFullscreen;
  });

  useEffect(() => {
    syncFavoritesFromCloud();
    syncListsFromCloud();
  }, []);

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg) return;

    const checkFullscreen = () => {
      setIsFullscreen(!!tg.isFullscreen);
    };

    checkFullscreen();

    if (tg.onEvent) {
      tg.onEvent('fullscreenChanged', checkFullscreen);
    }
    const interval = setInterval(checkFullscreen, 800);

    return () => {
      if (tg.offEvent) tg.offEvent('fullscreenChanged', checkFullscreen);
      clearInterval(interval);
    };
  }, []);

  const t = translations[language] || translations.ru;

  // CloudStorage sync on init across all devices
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.CloudStorage) {
      try {
        tg.CloudStorage.getItem('lista_active_categories', (err: any, val: string) => {
          if (!err && val) {
            try {
              const parsed = JSON.parse(val);
              if (Array.isArray(parsed) && parsed.length >= 2) {
                setActiveCategories(parsed);
                localStorage.setItem('lista_active_categories', val);
              }
            } catch (e) {}
          }
        });

        tg.CloudStorage.getItem('lista_language', (err: any, val: string) => {
          if (!err && val && ['ru', 'uk', 'en', 'es'].includes(val)) {
            setLanguage(val as Language);
            localStorage.setItem('lista_language', val);
          }
        });

        tg.CloudStorage.getItem('lista_theme', (err: any, val: string) => {
          if (!err && val && ['dark', 'dark-black', 'dark-navy', 'light', 'light-powdery', 'light-mint'].includes(val)) {
            setTheme(val);
            localStorage.setItem('lista_theme', val);
          }
        });
      } catch (e) {
        console.warn('CloudStorage sync error:', e);
      }
    }
  }, []);

  // Handle theme changes
  useEffect(() => {
    // Clear all previous theme classes
    document.body.classList.remove('light', 'light-powdery', 'light-mint', 'light-neon', 'dark-black', 'dark-navy', 'dark-neon');
    
    if (theme.startsWith('light')) {
      document.body.classList.add('light');
      if (theme === 'light-powdery') document.body.classList.add('light-powdery');
      if (theme === 'light-mint') document.body.classList.add('light-mint');
      if (theme === 'light-neon') document.body.classList.add('light-neon');
    } else {
      if (theme === 'dark-black') document.body.classList.add('dark-black');
      if (theme === 'dark-navy') document.body.classList.add('dark-navy');
      if (theme === 'dark-neon') document.body.classList.add('dark-neon');
    }

    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      try {
        let bg = '#0B0D14'; // default dark
        if (theme === 'dark-black') bg = '#000000';
        if (theme === 'dark-navy') bg = '#020617';
        if (theme === 'dark-neon') bg = '#050505';
        if (theme === 'light') bg = '#F8FAFC';
        if (theme === 'light-powdery') bg = '#FFF5F5';
        if (theme === 'light-mint') bg = '#F8FAF8';
        if (theme === 'light-neon') bg = '#F8FAFC';
        
        tg.setHeaderColor(bg);
        tg.setBackgroundColor(bg);
      } catch (e) {
        console.warn('Telegram SDK theme update warning:', e);
      }
    }
  }, [theme]);

  // Telegram SDK Init & Deep Link Detection
  useEffect(() => {
    const tgApp = (window as any).Telegram?.WebApp;
    if (tgApp) {
      try {
        tgApp.ready();
        tgApp.expand();
        let bg = '#0B0D14';
        if (theme === 'dark-black') bg = '#000000';
        if (theme === 'dark-navy') bg = '#020617';
        if (theme === 'dark-neon') bg = '#050505';
        if (theme === 'light') bg = '#F8FAFC';
        if (theme === 'light-powdery') bg = '#FFF5F5';
        if (theme === 'light-mint') bg = '#F8FAF8';
        if (theme === 'light-neon') bg = '#F8FAFC';
        tgApp.setHeaderColor(bg);
        tgApp.setBackgroundColor(bg);
      } catch (e) {
        console.warn('Telegram SDK init warning:', e);
      }
    }

function safeBase64Decode(str: string): any {
  try {
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) {
      b64 += '=';
    }
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const jsonStr = new TextDecoder().decode(bytes);
    return JSON.parse(jsonStr);
  } catch (e) {
    console.warn('Base64 decode error:', e);
    return null;
  }
}

    // Deep link: read Telegram startapp param
    const attemptDeepLink = async (): Promise<boolean> => {
      try {
        const tgWA = (window as any).Telegram?.WebApp;
        const urlParams = new URLSearchParams(window.location.search);
        const startParam: string | null =
          tgWA?.initDataUnsafe?.start_param ||
          urlParams.get('item') ||
          urlParams.get('shared_list') ||
          urlParams.get('startapp') ||
          urlParams.get('tgWebAppStartParam') ||
          null;

        if (!startParam || !startParam.trim()) return false;
        const rawParam = startParam.trim();

        // 1. Shared List Deep Link Check (sl_..., sharedlist_..., or list_...)
        if (rawParam.startsWith('sl_') || rawParam.startsWith('sharedlist_') || rawParam.startsWith('list_')) {
          let listId = rawParam;
          if (rawParam.startsWith('sharedlist_')) listId = rawParam.replace('sharedlist_', '');
          if (rawParam.startsWith('list_')) listId = rawParam.replace('list_', '');

          // Try server DB lookup first for short IDs (e.g. sl_a1b2c3d4)
          if (/^sl_[a-f0-9]{8,12}$/i.test(listId) || listId.length < 25) {
            const sharedData = await api.getSharedList(listId);
            if (sharedData?.title && sharedData?.items?.length) {
              setSharedListModalData({
                title: sharedData.title,
                items: sharedData.items,
              });
              return true;
            }
          }

          // Try safeBase64Decode for client-side encoded payloads
          const payload = listId.replace(/^sl_/, '');
          const parsed = safeBase64Decode(payload);
          if (parsed && parsed.title && Array.isArray(parsed.items)) {
            setSharedListModalData({
              title: parsed.title,
              items: parsed.items.map((i: any) => ({
                id: `shared_${Math.random()}`,
                title: i.t || i.title,
                category: i.c || i.category || 'Фильмы',
                status: 'planned',
                rating: i.r || i.rating || 0,
                release_year: i.y || i.release_year,
                genre: i.g || i.genre,
                poster_url: i.p || i.poster_url,
                duration: i.d || i.duration,
              })),
            });
            return true;
          }

          // Fallback: query API with listId directly
          const sharedData = await api.getSharedList(listId);
          if (sharedData?.title && sharedData?.items?.length) {
            setSharedListModalData({
              title: sharedData.title,
              items: sharedData.items,
            });
            return true;
          }
        }

        // 2. Single Item Deep Link Check
        const itemId = rawParam.replace(/^item_/, '');
        const isUUID = /^[0-9a-f-]{32,36}$/i.test(itemId);
        if (!isUUID) return false;

        const [publicItem, userItems] = await Promise.all([
          api.getPublicItem(itemId),
          api.getItems().catch(() => []),
        ]);
        if (!publicItem) return false;

        const norm = (s?: string) => (s || '').trim().toLowerCase();
        const existingItem = (userItems || []).find(
          (ui) => norm(ui.title) === norm(publicItem.title)
        );

        if (existingItem) {
          setSelectedItem(existingItem);
        } else {
          setSelectedItem({
            ...publicItem,
            status: 'planned',
            rating: 0,
            isSharedPreview: true,
          } as any);
        }
        setPreviousTab('home');
        setSavedScrollPosition(window.scrollY);
        setActiveTab('details');
        return true;
      } catch (e) {
        console.warn('Deep link error:', e);
        return false;
      }
    };

    // Try immediately, then retry after SDK is ready
    attemptDeepLink().then((found) => {
      if (!found) {
        setTimeout(() => attemptDeepLink(), 600);
      }
    });
  }, []);

  // Fetch API data on load
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [profData, itemsData, statsData] = await Promise.all([
      api.getProfile(),
      api.getItems(),
      api.getStats(),
    ]);

    if (profData) setProfile(profData);
    if (itemsData) {
      setItems(itemsData);
      setSelectedItem((prev) => {
        if (!prev) return null;
        const fresh = itemsData.find((i) => i.id === prev.id);
        return fresh || prev;
      });
    }
    if (statsData) setStats(statsData);

    // Auto-include categories that have items in activeCategories
    if (profData?.categories) {
      const nonZeroCats: string[] = [];
      profData.categories.forEach((c) => {
        if (c.count > 0) {
          const cat = c.category;
          if (['movie', 'movies', 'фильмы', 'фильм'].includes(cat.toLowerCase())) nonZeroCats.push('Фильмы');
          else if (['show', 'shows', 'series', 'сериалы', 'сериал'].includes(cat.toLowerCase())) nonZeroCats.push('Сериалы');
          else if (['book', 'books', 'книги', 'книга'].includes(cat.toLowerCase())) nonZeroCats.push('Книги');
          else if (['game', 'games', 'игры', 'игра'].includes(cat.toLowerCase())) nonZeroCats.push('Игры');
          else nonZeroCats.push(cat);
        }
      });

      if (nonZeroCats.length > 0) {
        setActiveCategories((prev) => {
          const merged = Array.from(new Set([...prev, ...nonZeroCats]));
          if (merged.length !== prev.length) {
            setStoredActiveCategories(merged);
            return merged;
          }
          return prev;
        });
      }
    }
  };

  const triggerHaptic = () => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.impactOccurred('light');
    }
  };

  const handleTabChange = (tab: string) => {
    triggerHaptic();
    if (tab === 'search') {
      setSelectedCategory('Все');
    }
    setActiveTab(tab as any);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLanguageChange = (newLang: Language) => {
    triggerHaptic();
    setLanguage(newLang);
    setStoredLanguage(newLang);
  };

  const handleThemeChange = (newTheme: string) => {
    triggerHaptic();
    setTheme(newTheme);
    setStoredTheme(newTheme);
  };

  const handleSaveActiveCategories = (newCategories: string[]) => {
    triggerHaptic();
    setActiveCategories(newCategories);
    setStoredActiveCategories(newCategories);
  };

  const handleBackFromDetails = () => {
    triggerHaptic();
    setActiveTab(previousTab || 'home');
    setTimeout(() => {
      window.scrollTo({ top: savedScrollPosition, behavior: 'instant' });
    }, 10);
  };

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg?.BackButton) return;

    if (activeTab === 'details') {
      tg.BackButton.show();
      const onBackClick = () => {
        handleBackFromDetails();
      };
      tg.BackButton.onClick(onBackClick);
      return () => {
        tg.BackButton.offClick(onBackClick);
        tg.BackButton.hide();
      };
    } else {
      tg.BackButton.hide();
    }
  }, [activeTab, previousTab]);

  const handleOpenCategory = (catTitle: string) => {
    triggerHaptic();
    setSelectedCategory(catTitle);
    if (activeTab !== 'details') {
      setPreviousTab(activeTab as any);
    }
    setActiveTab('search');
  };

  const handleSelectItem = (item: Item) => {
    triggerHaptic();
    if (activeTab !== 'details') {
      setPreviousTab(activeTab as any);
      setSavedScrollPosition(window.scrollY);
    }
    setSelectedItem(item);
    setActiveTab('details');
  };

  const handleToggleStatus = async (item: Item) => {
    triggerHaptic();
    const newStatus = item.status === 'completed' || item.status === 'Просмотрено' || item.status === 'Завершено' ? 'planned' : 'completed';
    await api.updateItem(item.id, { status: newStatus });
    loadData();
  };

  const handleUpdateItem = async (id: string, updates: Partial<Item>) => {
    triggerHaptic();
    await api.updateItem(id, updates);
    setSelectedItem((prev) => (prev && prev.id === id ? { ...prev, ...updates } : prev));
    loadData();
  };

  const handleAddSharedItem = async (sharedItem: Item) => {
    const norm = (s?: string) => (s || '').trim().toLowerCase();
    const normCat = (c?: string) => {
      const lc = (c || '').toLowerCase().trim();
      if (['movie', 'movies', 'фильмы', 'фильм'].includes(lc)) return 'movie';
      if (['show', 'shows', 'series', 'сериалы', 'сериал'].includes(lc)) return 'series';
      if (['book', 'books', 'книги', 'книга'].includes(lc)) return 'book';
      if (['game', 'games', 'игры', 'игра'].includes(lc)) return 'game';
      return lc;
    };
    const existing = items.find(
      (i) => norm(i.title) === norm(sharedItem.title) && normCat(i.category) === normCat(sharedItem.category)
    );

    if (existing) {
      if (activeTab !== 'details') {
        setPreviousTab(activeTab as any);
        setSavedScrollPosition(window.scrollY);
      }
      setSelectedItem(existing);
      setActiveTab('details');
      return;
    }

    const payload: Partial<Item> = {
      title: sharedItem.title,
      category: sharedItem.category,
      status: 'planned',
      rating: 10,
      genre: sharedItem.genre,
      duration: sharedItem.duration,
      release_year: sharedItem.release_year,
      poster_url: sharedItem.poster_url,
      description: sharedItem.description,
      note: sharedItem.note,
    };
    const createdItem = await api.createItem(payload);
    if (createdItem) {
      setSelectedItem(createdItem as Item);
      setActiveTab('details');
    } else {
      setActiveTab('home');
    }
    window.scrollTo(0, 0);
    loadData();
  };

  const handleSaveItem = async (itemData: Partial<Item>) => {
    triggerHaptic();
    if (editingItem) {
      await api.updateItem(editingItem.id, itemData);
      setSelectedItem((prev) => (prev && prev.id === editingItem.id ? { ...prev, ...itemData } : prev));
      setEditingItem(null);
    } else {
      await api.createItem(itemData);
    }

    if (itemData.category) {
      const cat = itemData.category;
      if (!activeCategories.includes(cat)) {
        const updated = [...activeCategories, cat];
        setActiveCategories(updated);
        setStoredActiveCategories(updated);
      }
    }

    loadData();
  };

  const handleDeleteItem = async (id: string) => {
    triggerHaptic();
    await api.deleteItem(id);
    setSelectedItem(null);
    setActiveTab('home');
    loadData();
  };

  const userName =
    (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.first_name ||
    profile?.user?.first_name ||
    'Друг';

  // Extract category counts map
  const catCountsMap: Record<string, number> = {};
  if (profile?.categories) {
    profile.categories.forEach((c) => {
      catCountsMap[c.category] = c.count;
    });
  }

  // Filter items for current category screen
  const categoryItems = items.filter((i) => {
    if (!selectedCategory || selectedCategory === 'Все') return true;
    const cat = (i.category || '').toLowerCase();
    const sel = selectedCategory.toLowerCase();

    if (cat === sel) return true;
    if ((sel === 'фильмы' || sel === 'фильм') && (cat === 'movie' || cat === 'movies' || cat === 'фильмы')) return true;
    if ((sel === 'сериалы' || sel === 'сериал') && (cat === 'show' || cat === 'shows' || cat === 'series' || cat === 'сериалы')) return true;
    if ((sel === 'книги' || sel === 'книга') && (cat === 'book' || cat === 'books' || cat === 'книги')) return true;
    if ((sel === 'игры' || sel === 'игра') && (cat === 'game' || cat === 'games' || cat === 'игры')) return true;
    return false;
  });

  const handleAddCatalogItem = async (catalogItem: any) => {
    triggerHaptic();
    const norm = (s?: string) => (s || '').trim().toLowerCase();
    const normCat = (c?: string) => {
      const lc = (c || '').toLowerCase().trim();
      if (['movie', 'movies', 'фильмы', 'фильм'].includes(lc)) return 'movie';
      if (['show', 'shows', 'series', 'сериалы', 'сериал'].includes(lc)) return 'series';
      if (['book', 'books', 'книги', 'книга'].includes(lc)) return 'book';
      if (['game', 'games', 'игры', 'игра'].includes(lc)) return 'game';
      return lc;
    };
    const existing = items.find(
      (i) => norm(i.title) === norm(catalogItem.title) && normCat(i.category) === normCat(catalogItem.category)
    );

    if (existing) {
      if (activeTab !== 'details') {
        setPreviousTab(activeTab as any);
        setSavedScrollPosition(window.scrollY);
      }
      setSelectedItem(existing);
      setActiveTab('details');
      return;
    }

    const catLc = (catalogItem.category || '').toLowerCase().trim();
    const isBook = ['book', 'books', 'книги', 'книга'].includes(catLc);

    let finalDuration = catalogItem.duration || '';
    if (isBook && finalDuration && !finalDuration.includes('стр')) {
      const digits = finalDuration.replace(/\D/g, '');
      if (digits) finalDuration = `${digits} стр.`;
    }

    const mappedGenre = isBook && catalogItem.genre ? getTranslatedGenreFull(catalogItem.genre, t, 'book') : (catalogItem.genre || '');

    const payload: Partial<Item> = {
      title: catalogItem.title,
      category: catalogItem.category || 'Фильмы',
      status: 'planned',
      rating: 10,
      genre: mappedGenre,
      duration: finalDuration,
      release_year: catalogItem.release_year || '',
      poster_url: catalogItem.poster_url || '',
      description: catalogItem.description || '',
      youtube_url: catalogItem.youtube_url || '',
      director: catalogItem.director || '',
      cast: catalogItem.cast || '',
      author: catalogItem.author || '',
      isbn: catalogItem.isbn || '',
    };
    await api.createItem(payload);
    loadData();
  };

  return (
    <div
      className="flex flex-col min-h-screen text-gray-100 max-w-md mx-auto relative pb-20 overflow-x-hidden transition-all duration-200"
      style={{
        paddingTop: isFullscreen ? 'max(68px, env(safe-area-inset-top, 68px))' : undefined,
      }}
    >
      {/* Top Safe Area Header */}
      <div className="h-2 w-full"></div>

      {/* Main App Content */}
      <main className="px-4 pt-3 flex-1">
        {/* SCREEN 1: HOME */}
        {activeTab === 'home' && (
          <section className="space-y-5">
            <Header
              userName={userName}
              photoUrl={profile?.user?.photo_url}
              onAvatarClick={() => handleTabChange('profile')}
              t={t}
            />
            <CategoryGrid
              counts={catCountsMap}
              activeCategories={activeCategories}
              onSelectCategory={handleOpenCategory}
              onOpenCategoryConfig={() => {
                triggerHaptic();
                setIsCategoryModalOpen(true);
              }}
              t={t}
            />
            <FavoritesSection
              items={items.filter((i) => getFavoriteIds().includes(i.id))}
              onSeeAll={() => handleTabChange('lists')}
              onSelectItem={handleSelectItem}
              onToggleStatus={handleToggleStatus}
              onUpdateItem={handleUpdateItem}
              t={t}
            />
            <ActivityCard
              monthlyCount={profile?.monthly_count || 0}
              monthlyHours={profile?.monthly_hours || 0}
              currentStreak={profile?.current_streak || 0}
              items={items}
              onShowStats={() => handleTabChange('stats')}
              onUpdateItem={handleUpdateItem}
              t={t}
            />
            <RecentlyAdded
              items={items}
              onSeeAll={() => {
                setSelectedCategory('Все');
                handleTabChange('search');
              }}
              onSelectItem={handleSelectItem}
              onToggleStatus={handleToggleStatus}
              onUpdateItem={handleUpdateItem}
              onAddItemClick={() => {
                triggerHaptic();
                setEditingItem(null);
                setIsModalOpen(true);
              }}
              t={t}
            />
          </section>
        )}

        {/* SCREEN 2: CATEGORY / SEARCH */}
        {activeTab === 'search' && (
          <section>
            <CategoryScreen
              title={selectedCategory}
              items={categoryItems}
              activeCategories={activeCategories}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              onSelectCategory={(cat) => setSelectedCategory(cat)}
              onBack={() => handleTabChange('home')}
              onSelectItem={handleSelectItem}
              onToggleStatus={handleToggleStatus}
              onUpdateItem={handleUpdateItem}
              onAddCatalogItem={handleAddCatalogItem}
              t={t}
            />
          </section>
        )}

        {/* SCREEN 3: ITEM DETAILS */}
        {activeTab === 'details' && selectedItem && (
          <section>
            <DetailsScreen
              item={selectedItem}
              onBack={handleBackFromDetails}
              onEdit={(item) => {
                setEditingItem(item);
                setIsModalOpen(true);
              }}
              onDelete={handleDeleteItem}
              onUpdateItem={handleUpdateItem}
              onAddSharedItem={handleAddSharedItem}
              isSharedPreview={(selectedItem as any).isSharedPreview}
              t={t}
            />
          </section>
        )}

        {/* SCREEN 4: LISTS */}
        {activeTab === 'lists' && (
          <section>
            <ListsScreen
              items={items}
              onSelectItem={handleSelectItem}
              onToggleStatus={handleToggleStatus}
              onUpdateItem={handleUpdateItem}
              selectedListId={selectedListId}
              onSelectList={setSelectedListId}
              initialListId={targetListIdToOpen}
              t={t}
            />
          </section>
        )}

        {/* SCREEN 5: PROFILE */}
        {activeTab === 'profile' && (
          <section>
            <ProfileScreen
              profile={profile}
              currentLanguage={language}
              onLanguageChange={handleLanguageChange}
              currentTheme={theme}
              onThemeChange={handleThemeChange}
              activeCategories={activeCategories}
              onOpenCategoryConfig={() => {
                triggerHaptic();
                setIsCategoryModalOpen(true);
              }}
              onGoToStats={() => handleTabChange('stats')}
              t={t}
            />
          </section>
        )}

        {/* SCREEN 6: STATS */}
        {activeTab === 'stats' && (
          <section>
            <StatsScreen stats={stats} profile={profile} items={items} t={t} />
          </section>
        )}
      </main>

      {/* Floating Action Button (+) on Home & Search screens */}
      {(activeTab === 'home' || activeTab === 'search') && (
        <button
          onClick={() => {
            triggerHaptic();
            setEditingItem(null);
            setIsModalOpen(true);
          }}
          className="fixed bottom-16 right-5 w-12 h-12 rounded-full bg-accentViolet text-white flex items-center justify-center shadow-lg shadow-accentViolet/40 active:scale-[0.97] transition z-40"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* Bottom Navbar */}
      <Navbar activeTab={activeTab === 'details' ? 'search' : activeTab} onTabChange={handleTabChange} t={t} />

      {/* Shared List Deep Link Import Modal */}
      {sharedListModalData && (
        <SharedListModal
          isOpen={!!sharedListModalData}
          sharedListTitle={sharedListModalData.title}
          sharedItems={sharedListModalData.items}
          userItems={items}
          onClose={() => setSharedListModalData(null)}
          onSuccessImport={(newListId) => {
            setSharedListModalData(null);
            setTargetListIdToOpen(newListId);
            setSelectedListId(newListId);
            setActiveTab('lists');
            loadData();
          }}
          t={t}
        />
      )}

      {/* Category Select Modal */}
      <CategorySelectModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        activeCategories={activeCategories}
        onSave={handleSaveActiveCategories}
        t={t}
      />

      {/* Add / Edit Item Modal Bottom Sheet */}
      <AddItemModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveItem}
        editingItem={editingItem}
        t={t}
      />
    </div>
  );
}
