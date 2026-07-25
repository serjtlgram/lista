import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';

import { Header } from './components/Header';
import { CategoryGrid } from './components/CategoryGrid';
import { ActivityCard } from './components/ActivityCard';
import { RecentlyAdded } from './components/RecentlyAdded';
import { CategoryScreen } from './components/CategoryScreen';
import { DetailsScreen } from './components/DetailsScreen';
import { StatsScreen } from './components/StatsScreen';
import { AddItemModal } from './components/AddItemModal';
import { Navbar } from './components/Navbar';

import { api } from './services/api';
import { Item, UserProfile, StatsData } from './types';

export function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'search' | 'stats' | 'profile'>('home');
  const [selectedCategory, setSelectedCategory] = useState<string>('Сериалы');
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  // Telegram SDK Init
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      try {
        tg.ready();
        tg.expand();
        tg.setHeaderColor('#0B0D14');
        tg.setBackgroundColor('#0B0D14');
      } catch (e) {
        console.warn('Telegram SDK init warning:', e);
      }
    }
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
    if (itemsData) setItems(itemsData);
    if (statsData) setStats(statsData);
  };

  // Helper for Telegram Haptic Feedback
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

  const handleOpenCategory = (catTitle: string) => {
    triggerHaptic();
    setSelectedCategory(catTitle);
    setActiveTab('search');
  };

  const handleSelectItem = (item: Item) => {
    triggerHaptic();
    setSelectedItem(item);
    setActiveTab('profile'); // Screen 3 Details
  };

  const handleToggleStatus = async (item: Item) => {
    triggerHaptic();
    const newStatus = item.status === 'completed' || item.status === 'Просмотрено' ? 'planned' : 'completed';
    await api.updateItem(item.id, { status: newStatus });
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: newStatus } : i))
    );
  };

  const handleSaveItem = async (itemData: Partial<Item>) => {
    triggerHaptic();
    if (editingItem) {
      await api.updateItem(editingItem.id, itemData);
      setEditingItem(null);
    } else {
      await api.createItem(itemData);
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
    'Анна';

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
    return (
      i.category.toLowerCase() === selectedCategory.toLowerCase() ||
      (selectedCategory === 'Фильмы' && i.category === 'movie') ||
      (selectedCategory === 'Сериалы' && i.category === 'show') ||
      (selectedCategory === 'Книги' && i.category === 'book') ||
      (selectedCategory === 'Аудиокниги' && i.category === 'audiobook') ||
      (selectedCategory === 'Подкасты' && i.category === 'podcast') ||
      (selectedCategory === 'Игры' && i.category === 'game')
    );
  });

  return (
    <div className="flex flex-col min-h-screen text-gray-100 max-w-md mx-auto relative pb-20 overflow-x-hidden">
      {/* Top Telegram Safe Area Header */}
      <div className="h-2 w-full"></div>

      {/* Main App Content */}
      <main className="px-4 pt-3 flex-1">
        {/* SCREEN 1: HOME */}
        {activeTab === 'home' && (
          <section className="space-y-5">
            <Header userName={userName} onBellClick={triggerHaptic} />
            <CategoryGrid counts={catCountsMap} onSelectCategory={handleOpenCategory} />
            <ActivityCard
              monthlyCount={profile?.monthly_count || 9}
              monthlyHours={profile?.monthly_hours || 18}
              currentStreak={profile?.current_streak || 5}
            />
            <RecentlyAdded
              items={items}
              onSeeAll={() => handleTabChange('search')}
              onSelectItem={handleSelectItem}
            />
          </section>
        )}

        {/* SCREEN 2: CATEGORY / SEARCH */}
        {activeTab === 'search' && (
          <section>
            <CategoryScreen
              title={selectedCategory}
              items={categoryItems.length > 0 ? categoryItems : items}
              onBack={() => handleTabChange('home')}
              onSelectItem={handleSelectItem}
              onToggleStatus={handleToggleStatus}
            />
          </section>
        )}

        {/* SCREEN 3: ITEM DETAILS / PROFILE */}
        {activeTab === 'profile' && (
          <section>
            <DetailsScreen
              item={
                selectedItem ||
                items[0] || {
                  id: '1',
                  title: 'Дюна: Часть вторая',
                  category: 'Фильмы',
                  status: 'completed',
                  rating: 10,
                  genre: 'Фантастика, Приключения',
                  duration: '2ч 46м',
                  release_year: '2024',
                  poster_url:
                    'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80',
                  note: 'Потрясающая визуальная часть и музыка. Особенно впечатлили сцены на Арракисе.',
                }
              }
              onBack={() => handleTabChange('home')}
              onEdit={(item) => {
                setEditingItem(item);
                setIsModalOpen(true);
              }}
              onDelete={handleDeleteItem}
            />
          </section>
        )}

        {/* SCREEN 4: STATS */}
        {activeTab === 'stats' && (
          <section>
            <StatsScreen stats={stats} />
          </section>
        )}
      </main>

      {/* Floating Action Button (+) */}
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

      {/* Bottom Navbar */}
      <Navbar activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Add / Edit Item Modal Bottom Sheet */}
      <AddItemModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveItem}
        editingItem={editingItem}
      />
    </div>
  );
}
