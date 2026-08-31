import { useState, useEffect, startTransition } from 'react';
import { Plus, ChevronUp } from 'lucide-react';

import { Header } from './components/Header';
import { CategoryGrid } from './components/CategoryGrid';
import { ActivityCard } from './components/ActivityCard';
import { RecentlyAdded } from './components/RecentlyAdded';
import { FavoritesSection } from './components/FavoritesSection';
import { CategoryScreen } from './components/CategoryScreen';
import { DetailsScreen } from './components/DetailsScreen';
import { ListsScreen } from './components/ListsScreen';
import { ListRecommendations } from './components/ListRecommendations';
import { SharedListModal } from './components/SharedListModal';
import { StatsScreen } from './components/StatsScreen';
import { ProfileScreen } from './components/ProfileScreen';
import { CategorySelectModal } from './components/CategorySelectModal';
import { AddItemModal } from './components/AddItemModal';
import { Navbar } from './components/Navbar';

import { api } from './services/api';
import { getTranslatedGenreFull } from './services/genres';
import { getFavoriteIds, setFavoriteIds, syncFavoritesFromCloud } from './services/favorites';
import { getLists, saveLists, addItemToList, syncListsFromCloud, UserList } from './services/lists';
import { Item, UserProfile, StatsData, CatalogItem } from './types';
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
  const [activeTab, setActiveTab] = useState<'home' | 'search' | 'lists' | 'stats' | 'profile' | 'details' | 'recommendations'>('home');
  const [previousTab, setPreviousTab] = useState<'home' | 'search' | 'lists' | 'stats' | 'profile' | 'recommendations'>('home');
  const [savedScrollPosition, setSavedScrollPosition] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>(() => {
    return localStorage.getItem('lista_catalog_category_filter') || 'Все';
  });

  useEffect(() => {
    localStorage.setItem('lista_catalog_category_filter', selectedCategory);
  }, [selectedCategory]);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [recommendationListInfo, setRecommendationListInfo] = useState<{ id: string; title: string; items: Item[]; contextKey?: string; cachedResults?: CatalogItem[]; addedItems?: Item[] } | null>(null);

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

  const [isNavVisible, setIsNavVisible] = useState(true);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
    return !!(window as any).Telegram?.WebApp?.isFullscreen;
  });

  useEffect(() => {
    syncFavoritesFromCloud();
    syncListsFromCloud();
    
    const handleItemCreated = (e: any) => {
      const { tempId, realId, serverItem } = e.detail;
      setItems((prev) => prev.map(i => i.id === tempId ? { ...i, ...serverItem, id: realId } as Item : i));
      setSelectedItem((prev) => prev?.id === tempId ? { ...prev, ...serverItem, id: realId } as Item : prev);
      setRecommendationListInfo((prev) => {
        if (!prev || !prev.addedItems) return prev;
        const updatedAdded = prev.addedItems.map((ai) => 
          ai.id === tempId ? { ...ai, ...serverItem, id: realId } as Item : ai
        );
        return { ...prev, addedItems: updatedAdded };
      });
    };
    window.addEventListener('ListaItemCreated', handleItemCreated);
    return () => window.removeEventListener('ListaItemCreated', handleItemCreated);
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
      if (tg.offEvent) {
        tg.offEvent('fullscreenChanged', checkFullscreen);
      }
      clearInterval(interval);
    };
  }, []);

  // Scroll direction & distance listener for navbar hide/show & back-to-top button
  useEffect(() => {
    let lastScrollY = window.scrollY;
    let ticking = false;
    let currentNavVisible = true;
    let currentShowScroll = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;
          const screenHeight = window.innerHeight;

          // Show back to top button if scrolled more than 2 screens (> 2 * window.innerHeight)
          const shouldShowScroll = currentScrollY > screenHeight * 2;
          if (shouldShowScroll !== currentShowScroll) {
            currentShowScroll = shouldShowScroll;
            setShowScrollTop(shouldShowScroll);
          }

          // Auto hide/show navbar based on scroll direction
          if (currentScrollY <= 20) {
            if (!currentNavVisible) {
              currentNavVisible = true;
              setIsNavVisible(true);
            }
          } else {
            const diff = currentScrollY - lastScrollY;
            if (diff > 6 && currentNavVisible) {
              // User scrolling DOWN page -> hide navbar
              currentNavVisible = false;
              setIsNavVisible(false);
            } else if (diff < -6 && !currentNavVisible) {
              // User scrolling UP page -> show navbar
              currentNavVisible = true;
              setIsNavVisible(true);
            }
          }

          lastScrollY = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Always reveal navbar when switching tabs
  useEffect(() => {
    setIsNavVisible(true);
  }, [activeTab]);

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
          if (!err && val) {
            const valid = [
              'dark',
              'dark-black',
              'dark-navy',
              'dark-neon',
              'light',
              'light-powdery',
              'light-mint',
              'light-neon',
              'dark-nordic',
              'dark-talavera',
              'dark-terminal',
              'dark-brutalism',
              'light-nordic',
              'light-talavera',
              'light-terminal',
              'light-brutalism',
            ];
            if (valid.includes(val)) {
              setTheme(val);
              localStorage.setItem('lista_theme', val);
            }
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
    document.body.classList.remove(
      'light',
      'light-powdery',
      'light-mint',
      'light-neon',
      'light-nordic',
      'light-talavera',
      'light-terminal',
      'light-brutalism',
      'dark',
      'dark-black',
      'dark-navy',
      'dark-neon',
      'dark-nordic',
      'dark-talavera',
      'dark-terminal',
      'dark-brutalism'
    );
    
    // Apply selected theme class
    document.body.classList.add(theme);

    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      try {
        let bg = '#0B0D14'; // default dark
        if (theme === 'dark') bg = '#0B0D14';
        else if (theme === 'dark-black') bg = '#000000';
        else if (theme === 'dark-navy') bg = '#020617';
        else if (theme === 'dark-neon') bg = '#050505';
        else if (theme === 'dark-nordic') bg = '#0D1412';
        else if (theme === 'dark-talavera') bg = '#0A0A0B';
        else if (theme === 'dark-terminal') bg = '#060B14';
        else if (theme === 'dark-brutalism') bg = '#141416';
        else if (theme === 'light') bg = '#F8FAFC';
        else if (theme === 'light-powdery') bg = '#FFF5F5';
        else if (theme === 'light-mint') bg = '#F8FAF8';
        else if (theme === 'light-neon') bg = '#F8FAFC';
        else if (theme === 'light-nordic') bg = '#F5F8F7';
        else if (theme === 'light-talavera') bg = '#F8F5EE';
        else if (theme === 'light-terminal') bg = '#F0F6FA';
        else if (theme === 'light-brutalism') bg = '#E4E7EB';
        
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

    // Deep link: read Telegram startapp param or URL path
    const attemptDeepLink = async (): Promise<boolean> => {
      try {
        const recMatch = window.location.pathname.match(/\/lists\/([^/]+)\/recommendations/);
        if (recMatch) {
          const recListId = recMatch[1];
          const allLists = getLists();
          const targetList = allLists.find((l) => l.id === recListId);
          const listTitle = targetList ? targetList.name : (recListId === 'favorites' ? 'Избранное' : 'Список');
          setRecommendationListInfo({ id: recListId, title: listTitle, items: [] });
          setActiveTab('recommendations');
          return true;
        }

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
                public_rating: i.pr || i.public_rating || '',
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
      setItems((prev) => {
        const tempItems = prev.filter((i) => i.id.startsWith('temp_'));
        if (tempItems.length === 0) return itemsData;
        const norm = (s?: string) => (s || '').trim().toLowerCase();
        const unSyncedTempItems = tempItems.filter(
          (temp) => !itemsData.some((server) => norm(server.title) === norm(temp.title) && server.release_year === temp.release_year)
        );
        return [...unSyncedTempItems, ...itemsData];
      });
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
    startTransition(() => {
      if (tab === 'search') {
        setSelectedCategory('Все');
      }
      setActiveTab(tab as any);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLanguageChange = (newLang: Language) => {
    triggerHaptic();
    setLanguage(newLang);
    setStoredLanguage(newLang);
    api.getProfile().catch(() => {});
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
    const returnTab = previousTab || 'home';
    setActiveTab(returnTab);
    const targetY = savedScrollPosition;
    requestAnimationFrame(() => {
      window.scrollTo({ top: targetY, behavior: 'instant' });
      setTimeout(() => {
        window.scrollTo({ top: targetY, behavior: 'instant' });
      }, 50);
    });
  };

  const handleOpenRecommendations = (listId: string, listTitle: string, listItems: Item[]) => {
    triggerHaptic();
    const userLang = getStoredLanguage() || 'ru';
    const itemIdsKey = listItems.map((i) => i.id).join(',');
    const newContextKey = `${listId}_${itemIdsKey}_${userLang}`;

    setRecommendationListInfo((prev) => {
      if (prev && prev.id === listId && prev.contextKey === newContextKey) {
        return { ...prev, title: listTitle, items: listItems };
      }
      return { id: listId, title: listTitle, items: listItems, contextKey: newContextKey, cachedResults: undefined, addedItems: undefined };
    });
    if (activeTab !== 'details' && activeTab !== 'recommendations') {
      setPreviousTab(activeTab as any);
      setSavedScrollPosition(window.scrollY);
    }
    setActiveTab('recommendations');
    try {
      window.history.pushState(null, '', `/lists/${listId}/recommendations`);
    } catch (e) {}
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const handleBackFromRecommendations = () => {
    triggerHaptic();
    setActiveTab('lists');
    try {
      window.history.pushState(null, '', '/');
    } catch (e) {}
    setTimeout(() => {
      window.scrollTo({ top: savedScrollPosition, behavior: 'instant' });
    }, 10);
  };

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg?.BackButton) return;

    if (activeTab === 'details' || activeTab === 'recommendations') {
      tg.BackButton.show();
      const onBackClick = () => {
        if (activeTab === 'recommendations') {
          handleBackFromRecommendations();
        } else {
          handleBackFromDetails();
        }
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
    const newStatus = item.status === 'completed' || item.status === 'Просмотрено' || item.status === 'Завершено' || item.status === 'Завершён' ? 'planned' : 'completed';
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: newStatus } as Item : i)));
    setSelectedItem((prev) => (prev?.id === item.id ? { ...prev, status: newStatus } as Item : prev));

    setRecommendationListInfo((prev) => {
      if (!prev || !prev.addedItems) return prev;
      const updatedAdded = prev.addedItems.map((ai) => (ai.id === item.id ? { ...ai, status: newStatus } as Item : ai));
      return { ...prev, addedItems: updatedAdded };
    });

    api.updateItem(item.id, { status: newStatus });
  };

  const handleUpdateItem = async (id: string, updates: Partial<Item>) => {
    triggerHaptic();
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...updates } as Item : i)));
    setSelectedItem((prev) => (prev && prev.id === id ? { ...prev, ...updates } as Item : prev));

    setRecommendationListInfo((prev) => {
      if (!prev || !prev.addedItems) return prev;
      const updatedAdded = prev.addedItems.map((ai) => (ai.id === id ? { ...ai, ...updates } as Item : ai));
      return { ...prev, addedItems: updatedAdded };
    });

    api.updateItem(id, updates);
  };

  const syncRecommendationItemAdded = (addedItem: Item, title: string, category?: string) => {
    if (!recommendationListInfo?.id) return;

    addItemToList(recommendationListInfo.id, addedItem.id);
    window.dispatchEvent(new Event('lista_lists_updated'));

    setRecommendationListInfo((prev) => {
      if (!prev) return prev;
      const itemToAdd: Item = { ...addedItem, isSharedPreview: false };
      const updatedAdded = [itemToAdd, ...(prev.addedItems || []).filter((i) => i.id !== itemToAdd.id)];
      const norm = (s?: string) => (s || '').trim().toLowerCase();
      const normCat = (c?: string) => {
        const lc = (c || '').toLowerCase().trim();
        if (['movie', 'movies', 'фильмы', 'фильм'].includes(lc)) return 'movie';
        if (['show', 'shows', 'series', 'сериалы', 'сериал'].includes(lc)) return 'series';
        if (['book', 'books', 'книги', 'книга'].includes(lc)) return 'book';
        if (['game', 'games', 'игры', 'игра'].includes(lc)) return 'game';
        return lc;
      };
      const updatedCached = (prev.cachedResults || []).filter(
        (r) => norm(r.title) !== norm(title) || normCat(r.category) !== normCat(category)
      );
      return {
        ...prev,
        addedItems: updatedAdded,
        cachedResults: updatedCached,
      };
    });
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

    let addedItem: Item;

    if (existing) {
      addedItem = existing;
    } else {
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
        youtube_url: sharedItem.youtube_url,
        director: sharedItem.director,
        cast: sharedItem.cast,
        author: sharedItem.author,
        isbn: sharedItem.isbn,
        public_rating: sharedItem.public_rating,
        country: sharedItem.country,
      };
      addedItem = await api.createItem(payload);
      setItems((prev) => [addedItem, ...prev]);
    }

    if (recommendationListInfo?.id) {
      syncRecommendationItemAdded(addedItem, sharedItem.title, sharedItem.category);
    }

    setSelectedItem({ ...addedItem, isSharedPreview: false });
    if (activeTab !== 'details') {
      setActiveTab('details');
    }
    window.scrollTo(0, 0);
  };

  const handleSaveItem = async (itemData: Partial<Item>) => {
    triggerHaptic();
    if (editingItem) {
      const nowIso = new Date().toISOString();
      const updatedLocalItem = { ...editingItem, ...itemData, updated_at: nowIso } as Item;
      setItems((prev) => prev.map((i) => (i.id === editingItem.id ? updatedLocalItem : i)));
      setSelectedItem((prev) => (prev && prev.id === editingItem.id ? updatedLocalItem : prev));

      setRecommendationListInfo((prev) => {
        if (!prev || !prev.addedItems) return prev;
        const updatedAdded = prev.addedItems.map((ai) => (ai.id === editingItem.id ? updatedLocalItem : ai));
        return { ...prev, addedItems: updatedAdded };
      });

      api.updateItem(editingItem.id, itemData);
      setEditingItem(null);
    } else {
      const createdItem = await api.createItem(itemData);
      setItems((prev) => [createdItem, ...prev]);
    }

    if (itemData.category) {
      const cat = itemData.category;
      if (!activeCategories.includes(cat)) {
        const updated = [...activeCategories, cat];
        setActiveCategories(updated);
        setStoredActiveCategories(updated);
      }
    }
  };

  const handleDeleteItem = async (id: string) => {
    triggerHaptic();
    setItems((prev) => prev.filter(i => i.id !== id));
    setSelectedItem(null);
    const returnTab = previousTab || 'home';
    setActiveTab(returnTab);
    const targetY = savedScrollPosition;
    requestAnimationFrame(() => {
      window.scrollTo({ top: targetY, behavior: 'instant' });
      setTimeout(() => {
        window.scrollTo({ top: targetY, behavior: 'instant' });
      }, 50);
    });

    setRecommendationListInfo((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        items: prev.items ? prev.items.filter((i) => i.id !== id) : prev.items,
        addedItems: prev.addedItems ? prev.addedItems.filter((i) => i.id !== id) : prev.addedItems,
      };
    });

    // Clean up favorites and user lists
    const favs = getFavoriteIds();
    if (favs.includes(id)) {
      setFavoriteIds(favs.filter((fId) => fId !== id));
    }
    const allLists = getLists();
    const updatedLists = allLists.map((l: UserList) => ({
      ...l,
      itemIds: l.itemIds.filter((itemId: string) => itemId !== id),
    }));
    saveLists(updatedLists);

    api.deleteItem(id);
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

  const handleAddCatalogItem = async (catalogItem: any): Promise<Item | undefined> => {
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
      if (recommendationListInfo?.id) {
        syncRecommendationItemAdded(existing, catalogItem.title, catalogItem.category);
      }
      if (activeTab !== 'recommendations' && activeTab !== 'search') {
        if (activeTab !== 'details') {
          setPreviousTab(activeTab as any);
          setSavedScrollPosition(window.scrollY);
        }
        setSelectedItem(existing);
        setActiveTab('details');
      }
      return existing;
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
      public_rating: catalogItem.public_rating || '',
      country: catalogItem.country || '',
    };
    const createdItem = await api.createItem(payload);
    setItems((prev) => [createdItem, ...prev]);

    if (recommendationListInfo?.id) {
      syncRecommendationItemAdded(createdItem, catalogItem.title, catalogItem.category);
    }

    if (activeTab !== 'recommendations' && activeTab !== 'search') {
      if (activeTab !== 'details') {
        setPreviousTab(activeTab as any);
        setSavedScrollPosition(window.scrollY);
      }
      setSelectedItem(createdItem);
      setActiveTab('details');
    }
    return createdItem;
  };

  return (
    <div
      className="flex flex-col min-h-screen text-gray-100 max-w-md mx-auto relative pb-28 overflow-x-hidden transition-colors duration-200"
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
              language={language}
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
              onOpenRecommendations={handleOpenRecommendations}
              selectedListId={selectedListId}
              onSelectList={setSelectedListId}
              initialListId={targetListIdToOpen}
              t={t}
            />
          </section>
        )}

        {/* SCREEN 4.5: LIST RECOMMENDATIONS */}
        {activeTab === 'recommendations' && recommendationListInfo && (
          <section>
            <ListRecommendations
              listId={recommendationListInfo.id}
              listTitle={recommendationListInfo.title}
              listItems={recommendationListInfo.items.length > 0 ? recommendationListInfo.items : items}
              allItems={items}
              cachedResults={recommendationListInfo.cachedResults}
              onUpdateCachedResults={(results) => {
                setRecommendationListInfo((prev) => prev ? { ...prev, cachedResults: results } : prev);
              }}
              cachedAddedItems={recommendationListInfo.addedItems}
              onUpdateCachedAddedItems={(added) => {
                setRecommendationListInfo((prev) => prev ? { ...prev, addedItems: added } : prev);
              }}
              onBack={handleBackFromRecommendations}
              onSelectItem={handleSelectItem}
              onAddCatalogItem={handleAddCatalogItem}
              onToggleStatus={handleToggleStatus}
              onUpdateItem={handleUpdateItem}
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

      {/* Back to Top Button (Appears when scrolled > 2 screens) */}
      <button
        onClick={() => {
          triggerHaptic();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        aria-label="Back to top"
        className={`fixed right-6 w-10 h-10 rounded-full bg-accentViolet text-white flex items-center justify-center shadow-lg shadow-accentViolet/40 active:scale-[0.97] transition duration-300 z-40 bottom-[calc(10.5rem+env(safe-area-inset-bottom,0px))] ${
          showScrollTop ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-75 pointer-events-none'
        }`}
      >
        <ChevronUp className="w-5 h-5" />
      </button>

      {/* Floating Action Button (+) on Home & Search screens */}
      {(activeTab === 'home' || activeTab === 'search') && (
        <button
          onClick={() => {
            triggerHaptic();
            setEditingItem(null);
            setIsModalOpen(true);
          }}
          className="fixed right-5 w-12 h-12 rounded-full bg-accentViolet text-white flex items-center justify-center shadow-lg shadow-accentViolet/40 active:scale-[0.97] transition duration-300 z-40 bottom-[calc(7rem+env(safe-area-inset-bottom,0px))]"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* Bottom Navbar */}
      <Navbar
        activeTab={activeTab === 'details' ? 'search' : activeTab}
        onTabChange={handleTabChange}
        t={t}
        isVisible={isNavVisible}
      />

      {/* Shared List Deep Link Import Modal */}
      {sharedListModalData && (
        <SharedListModal
          isOpen={!!sharedListModalData}
          sharedListTitle={sharedListModalData.title}
          sharedItems={sharedListModalData.items}
          userItems={items}
          onClose={() => setSharedListModalData(null)}
          onSuccessImport={(newListId, newlyCreatedItems) => {
            if (newlyCreatedItems && newlyCreatedItems.length > 0) {
              setItems((prev) => {
                const existingIds = new Set(prev.map((i) => i.id));
                const uniqueNew = newlyCreatedItems.filter((i) => !existingIds.has(i.id));
                return [...uniqueNew, ...prev];
              });
            }
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
