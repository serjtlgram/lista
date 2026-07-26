import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';

import { Header } from './components/Header';
import { CategoryGrid } from './components/CategoryGrid';
import { ActivityCard } from './components/ActivityCard';
import { RecentlyAdded } from './components/RecentlyAdded';
import { CategoryScreen } from './components/CategoryScreen';
import { DetailsScreen } from './components/DetailsScreen';
import { StatsScreen } from './components/StatsScreen';
import { ProfileScreen } from './components/ProfileScreen';
import { CategorySelectModal } from './components/CategorySelectModal';
import { AddItemModal } from './components/AddItemModal';
import { Navbar } from './components/Navbar';

import { api } from './services/api';
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
  const [activeTab, setActiveTab] = useState<'home' | 'search' | 'stats' | 'profile' | 'details'>('home');
  const [selectedCategory, setSelectedCategory] = useState<string>('Фильмы');
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);

  const [language, setLanguage] = useState<Language>(getStoredLanguage());
  const [theme, setTheme] = useState<'dark' | 'light'>(getStoredTheme());
  const [activeCategories, setActiveCategories] = useState<string[]>(getStoredActiveCategories());

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
    return !!(window as any).Telegram?.WebApp?.isFullscreen;
  });

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
          if (!err && (val === 'light' || val === 'dark')) {
            setTheme(val as 'light' | 'dark');
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
    if (theme === 'light') {
      document.body.classList.add('light');
    } else {
      document.body.classList.remove('light');
    }

    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      try {
        const bg = theme === 'light' ? '#F8FAFC' : '#0B0D14';
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
        const bg = theme === 'light' ? '#F8FAFC' : '#0B0D14';
        tgApp.setHeaderColor(bg);
        tgApp.setBackgroundColor(bg);
      } catch (e) {
        console.warn('Telegram SDK init warning:', e);
      }
    }

    // Deep link: read Telegram startapp param (UUID of item, max 36 chars)
    const attemptDeepLink = async (): Promise<boolean> => {
      try {
        const tgWA = (window as any).Telegram?.WebApp;
        const urlParams = new URLSearchParams(window.location.search);
        const startParam: string | null =
          tgWA?.initDataUnsafe?.start_param ||
          urlParams.get('item') ||
          urlParams.get('startapp') ||
          urlParams.get('tgWebAppStartParam') ||
          null;

        if (!startParam || !startParam.trim()) return false;
        const itemId = startParam.trim();

        // UUID format check: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
        const isUUID = /^[0-9a-f-]{32,36}$/i.test(itemId);
        if (!isUUID) return false;

        const publicItem = await api.getPublicItem(itemId);
        if (!publicItem) return false;

        setSelectedItem({
          ...publicItem,
          status: 'planned',
          rating: 0,
          isSharedPreview: true,
        } as any);
        setActiveTab('details');
        window.scrollTo(0, 0);
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
          else if (['audiobook', 'audiobooks', 'аудиокниги', 'аудиокнига'].includes(cat.toLowerCase())) nonZeroCats.push('Аудиокниги');
          else if (['podcast', 'podcasts', 'подкасты', 'подкаст'].includes(cat.toLowerCase())) nonZeroCats.push('Подкасты');
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
    setActiveTab(tab as any);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLanguageChange = (newLang: Language) => {
    triggerHaptic();
    setLanguage(newLang);
    setStoredLanguage(newLang);
  };

  const handleThemeChange = (newTheme: 'dark' | 'light') => {
    triggerHaptic();
    setTheme(newTheme);
    setStoredTheme(newTheme);
  };

  const handleSaveActiveCategories = (newCategories: string[]) => {
    triggerHaptic();
    setActiveCategories(newCategories);
    setStoredActiveCategories(newCategories);
  };

  const handleOpenCategory = (catTitle: string) => {
    triggerHaptic();
    setSelectedCategory(catTitle);
    setActiveTab('search');
  };

  const handleSelectItem = (item: Item) => {
    triggerHaptic();
    setSelectedItem(item);
    setActiveTab('details');
    window.scrollTo(0, 0);
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
    triggerHaptic();
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
    await api.createItem(payload);
    setActiveTab('home');
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
    if ((sel === 'аудиокниги' || sel === 'аудиокнига') && (cat === 'audiobook' || cat === 'audiobooks' || cat === 'аудиокниги')) return true;
    if ((sel === 'подкасты' || sel === 'подкаст') && (cat === 'podcast' || cat === 'podcasts' || cat === 'подкасты')) return true;
    if ((sel === 'игры' || sel === 'игра') && (cat === 'game' || cat === 'games' || cat === 'игры')) return true;
    return false;
  });

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
            <ActivityCard
              monthlyCount={profile?.monthly_count || 0}
              monthlyHours={profile?.monthly_hours || 0}
              currentStreak={profile?.current_streak || 0}
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
              onSelectCategory={(cat) => setSelectedCategory(cat)}
              onBack={() => handleTabChange('home')}
              onSelectItem={handleSelectItem}
              onToggleStatus={handleToggleStatus}
              t={t}
            />
          </section>
        )}

        {/* SCREEN 3: ITEM DETAILS */}
        {activeTab === 'details' && selectedItem && (
          <section>
            <DetailsScreen
              item={selectedItem}
              onBack={() => setActiveTab('home')}
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

        {/* SCREEN 4: PROFILE */}
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
              t={t}
            />
          </section>
        )}

        {/* SCREEN 5: STATS */}
        {activeTab === 'stats' && (
          <section>
            <StatsScreen stats={stats} t={t} />
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
          className="fixed bottom-16 right-5 w-12 h-12 rounded-full bg-accentViolet text-white flex items-center justify-center shadow-lg shadow-accentViolet/40 active:scale-90 transition z-40"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* Bottom Navbar */}
      <Navbar activeTab={activeTab === 'details' ? 'search' : activeTab} onTabChange={handleTabChange} t={t} />

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
