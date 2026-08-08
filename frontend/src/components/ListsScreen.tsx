import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Star,
  Share2,
  Edit2,
  Trash2,
  Plus,
  Check,
  BookMarked,
  X,
  Search,
  ChevronDown,
  Folder,
  FolderPlus,
  FolderOpen,
  Settings2,
  ArrowUp,
  ArrowDown,
  Wand2,
} from 'lucide-react';
import { Item } from '../types';
import {
  UserList,
  ListFolder,
  getLists,
  saveLists,
  createList,
  renameList,
  deleteList,
  updateListFolder,
  getFolders,
  saveFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  removeItemFromList,
  FAVORITES_ID,
  DEFAULT_FOLDER_ID,
} from '../services/lists';
import { getFavoriteIds, setFavoriteIds, toggleFavorite } from '../services/favorites';
import { ItemCard } from './ItemCard';
import { Translations, formatCategorySingle } from '../services/i18n';
import { api } from '../services/api';

interface ListsScreenProps {
  items: Item[];
  onSelectItem: (item: Item) => void;
  onToggleStatus: (item: Item, e: React.MouseEvent) => void;
  onUpdateItem?: (id: string, updates: Partial<Item>) => void;
  onOpenRecommendations?: (listId: string, listTitle: string, listItems: Item[]) => void;
  selectedListId?: string;
  onSelectList?: (id: string) => void;
  initialListId?: string;
  t: Translations;
}

export function safeBase64Encode(data: any): string {
  try {
    const jsonStr = JSON.stringify(data);
    const bytes = new TextEncoder().encode(jsonStr);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  } catch (e) {
    console.warn('Base64 encode error:', e);
    return '';
  }
}



export const ListsScreen: React.FC<ListsScreenProps> = ({
  items,
  onSelectItem,
  onToggleStatus,
  onUpdateItem,
  onOpenRecommendations,
  selectedListId: selectedListIdProp,
  onSelectList,
  initialListId,
  t,
}) => {
  const [lists, setLists] = useState<UserList[]>(() => getLists());
  const [folders, setFolders] = useState<ListFolder[]>(() => getFolders());
  const [selectedFolderId, setSelectedFolderId] = useState<string>(() => {
    return localStorage.getItem('lista_selected_folder') || 'all';
  });

  const [selectedListIdState, setSelectedListIdState] = useState<string>(
    selectedListIdProp || initialListId || FAVORITES_ID
  );

  const activeSelectedListId = selectedListIdProp || selectedListIdState;

  useEffect(() => {
    if (selectedListIdProp && selectedListIdProp !== selectedListIdState) {
      setSelectedListIdState(selectedListIdProp);
    }
  }, [selectedListIdProp]);

  useEffect(() => {
    localStorage.setItem('lista_selected_folder', selectedFolderId);
  }, [selectedFolderId]);

  const refreshFolders = () => {
    setFolders(getFolders());
  };

  useEffect(() => {
    const handleListsUpdate = () => refreshLists();
    const handleFoldersUpdate = () => refreshFolders();
    window.addEventListener('lista_lists_updated', handleListsUpdate);
    window.addEventListener('lista_folders_updated', handleFoldersUpdate);
    return () => {
      window.removeEventListener('lista_lists_updated', handleListsUpdate);
      window.removeEventListener('lista_folders_updated', handleFoldersUpdate);
    };
  }, []);

  const handleSelectTab = (id: string) => {
    triggerHaptic();
    setSelectedListIdState(id);
    if (onSelectList) {
      onSelectList(id);
    }
  };

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListFolderId, setNewListFolderId] = useState<string>(DEFAULT_FOLDER_ID);

  // Folder Modals State
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [isManageFolderModalOpen, setIsManageFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<ListFolder | null>(null);
  const [folderRenameValue, setFolderRenameValue] = useState('');
  const [listsSearchQuery, setListsSearchQuery] = useState('');

  const [isChangeListFolderModalOpen, setIsChangeListFolderModalOpen] = useState(false);
  const [isSortFoldersModalOpen, setIsSortFoldersModalOpen] = useState(false);

  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  // Add Items Modal state
  const [isAddItemsModalOpen, setIsAddItemsModalOpen] = useState(false);
  const [tempSelectedIds, setTempSelectedIds] = useState<string[]>([]);
  const [itemsSearchQuery, setItemsSearchQuery] = useState('');

  // More lists dropdown & Drag reorder state
  const [isMoreExpanded, setIsMoreExpanded] = useState(false);
  const [dragState, setDragState] = useState<{
    list: UserList;
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  } | null>(null);

  const dragStateRef = useRef<typeof dragState>(null);
  dragStateRef.current = dragState;
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const longPressTimerRef = useRef<any>(null);
  const listsRef = useRef<UserList[]>(lists);
  listsRef.current = lists;

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const refreshLists = () => {
    const updated = getLists();
    setLists(updated);
  };

  const triggerHaptic = (type: 'light' | 'medium' = 'light') => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.impactOccurred(type);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handlePressStart = (list: UserList, e: React.TouchEvent | React.MouseEvent) => {
    if (list.id === FAVORITES_ID) return;
    const clientX = 'touches' in e ? e.touches[0]?.clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0]?.clientY : (e as React.MouseEvent).clientY;
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();

    longPressTimerRef.current = setTimeout(() => {
      triggerHaptic('medium');
      setIsMoreExpanded(true);
      setDragState({
        list,
        x: clientX,
        y: clientY,
        offsetX: clientX - rect.left,
        offsetY: clientY - rect.top,
        width: rect.width,
        height: rect.height,
      });
    }, 300);
  };

  const handlePressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (!dragState) return;

    // Prevent page scrolling while dragging capsules
    const originalOverflow = document.body.style.overflow;
    const originalTouchAction = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      // 100% block native page scrolling while capsule drag is active
      if (e.cancelable) {
        e.preventDefault();
      }

      const curDrag = dragStateRef.current;
      if (!curDrag) return;
      const clientX = 'touches' in e ? e.touches[0]?.clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0]?.clientY : (e as MouseEvent).clientY;
      if (clientX === undefined || clientY === undefined) return;

      // Update overlay position directly via GPU transform (zero React re-render lag)
      if (overlayRef.current) {
        const posX = clientX - curDrag.offsetX;
        const posY = clientY - curDrag.offsetY;
        overlayRef.current.style.transform = `translate3d(${posX}px, ${posY}px, 0) scale(1.08)`;
      }

      const elem = document.elementFromPoint(clientX, clientY);
      if (!elem) return;

      const listBtn = elem.closest('[data-list-id]') as HTMLElement;
      if (listBtn) {
        const targetId = listBtn.getAttribute('data-list-id');
        if (targetId && targetId !== FAVORITES_ID && targetId !== curDrag.list.id) {
          const currentLists = [...listsRef.current];
          const sourceIdx = currentLists.findIndex((l) => l.id === curDrag.list.id);
          const targetIdx = currentLists.findIndex((l) => l.id === targetId);

          if (sourceIdx > 0 && targetIdx > 0 && sourceIdx !== targetIdx) {
            const [moved] = currentLists.splice(sourceIdx, 1);
            currentLists.splice(targetIdx, 0, moved);
            setLists(currentLists);
            saveLists(currentLists);
            triggerHaptic('light');
          }
        }
      }
    };

    const handlePointerUp = () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.touchAction = originalTouchAction;
      if (dragStateRef.current) {
        triggerHaptic('light');
        setDragState(null);
        saveLists(listsRef.current);
      }
    };

    window.addEventListener('mousemove', handlePointerMove, { passive: false });
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);
    window.addEventListener('touchcancel', handlePointerUp);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.touchAction = originalTouchAction;
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
      window.removeEventListener('touchcancel', handlePointerUp);
    };
  }, [dragState?.list.id]);

  const currentList = lists.find((l) => l.id === activeSelectedListId) || lists[0];

  const [sortBy, setSortBy] = useState<'date' | 'year' | 'rating'>(() => {
    const saved = localStorage.getItem('lista_lists_sort_by');
    if (saved === 'year' || saved === 'rating' || saved === 'date') return saved;
    return 'date';
  });
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>(() => {
    const saved = localStorage.getItem('lista_lists_sort_order');
    if (saved === 'asc' || saved === 'desc') return saved;
    return 'desc';
  });

  useEffect(() => {
    localStorage.setItem('lista_lists_sort_by', sortBy);
  }, [sortBy]);

  useEffect(() => {
    localStorage.setItem('lista_lists_sort_order', sortOrder);
  }, [sortOrder]);

  // Get items belonging to selected list
  const favoriteIds = getFavoriteIds();
  const listItems = items.filter((item) => {
    if (currentList.id === FAVORITES_ID) {
      return favoriteIds.includes(item.id);
    }
    return currentList.itemIds.includes(item.id);
  });

  const [cooldownLeft, setCooldownLeft] = useState<number>(0);

  useEffect(() => {
    const checkCooldown = () => {
      const key = `lista_recommend_cooldown_${currentList.id}`;
      const expiresAtStr = localStorage.getItem(key);
      if (expiresAtStr) {
        const expiresAt = parseInt(expiresAtStr, 10);
        const now = Date.now();
        if (expiresAt > now) {
          setCooldownLeft(Math.ceil((expiresAt - now) / 1000));
          return;
        }
      }
      setCooldownLeft(0);
    };

    checkCooldown();
    const interval = setInterval(checkCooldown, 1000);
    return () => clearInterval(interval);
  }, [currentList.id]);

  const isNeznacaUser = (): boolean => {
    try {
      const tg = (window as any).Telegram?.WebApp;
      const username = tg?.initDataUnsafe?.user?.username || '';
      if (username.toLowerCase().replace(/^@/, '') === 'neznaca') return true;
    } catch {}
    try {
      const stored = localStorage.getItem('lista_user_profile');
      if (stored && stored.toLowerCase().includes('neznaca')) return true;
    } catch {}
    return false;
  };

  const handleGetRecommendations = () => {
    if (cooldownLeft > 0) return;
    triggerHaptic('medium');

    const isNeznaca = isNeznacaUser();
    const cooldownMs = isNeznaca ? 2000 : 60000;
    const cooldownSec = isNeznaca ? 2 : 60;

    const cooldownExpiresAt = Date.now() + cooldownMs;
    localStorage.setItem(`lista_recommend_cooldown_${currentList.id}`, cooldownExpiresAt.toString());
    setCooldownLeft(cooldownSec);

    if (onOpenRecommendations) {
      onOpenRecommendations(
        currentList.id,
        currentList.isDefault ? t.lists.favorites : currentList.name,
        listItems
      );
    }
  };

  const sortedListItems = [...listItems].sort((a, b) => {
    if (sortBy === 'year') {
      const yearStrA = (a.release_year || '').toString();
      const yearStrB = (b.release_year || '').toString();
      const matchA = yearStrA.match(/\d{4}/);
      const matchB = yearStrB.match(/\d{4}/);
      const yearA = matchA ? parseInt(matchA[0], 10) : 0;
      const yearB = matchB ? parseInt(matchB[0], 10) : 0;

      if (yearA !== yearB) {
        if (yearA === 0) return 1;
        if (yearB === 0) return -1;
        return sortOrder === 'desc' ? yearB - yearA : yearA - yearB;
      }
    }

    if (sortBy === 'rating') {
      const ratingA = parseFloat(a.public_rating || '0') || 0;
      const ratingB = parseFloat(b.public_rating || '0') || 0;
      if (ratingA !== ratingB) {
        return sortOrder === 'desc' ? ratingB - ratingA : ratingA - ratingB;
      }
    }

    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (timeA !== timeB) {
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    }
    return 0;
  });

  const handleCreateList = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    triggerHaptic();
    const created = createList(newListName.trim(), newListFolderId || DEFAULT_FOLDER_ID);
    refreshLists();
    handleSelectTab(created.id);
    setNewListName('');
    setIsCreateModalOpen(false);
  };

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    if (folders.length >= 200) {
      showToast('Достигнут лимит в 200 папок');
      return;
    }
    triggerHaptic();
    const created = createFolder(newFolderName.trim());
    refreshFolders();
    setSelectedFolderId(created.id);
    setNewFolderName('');
    setIsCreateFolderModalOpen(false);
    showToast(`Папка создана`);
  };

  const handleRenameFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFolder || !folderRenameValue.trim()) return;
    triggerHaptic();
    renameFolder(editingFolder.id, folderRenameValue.trim());
    refreshFolders();
    setIsManageFolderModalOpen(false);
    setEditingFolder(null);
    showToast('Настройки папки обновлены');
  };

  const handleDeleteFolder = () => {
    if (!editingFolder) return;
    const name = editingFolder.name || 'Эту папку';
    if (window.confirm(`Удалить «${name}»? Списки будут перенесены в раздел «Все».`)) {
      triggerHaptic();
      deleteFolder(editingFolder.id);
      refreshFolders();
      refreshLists();
      if (selectedFolderId === editingFolder.id) {
        setSelectedFolderId('all');
      }
      setIsManageFolderModalOpen(false);
      setEditingFolder(null);
      showToast('Папка удалена, списки перенесены в раздел «Все»');
    }
  };

  const handleChangeListFolder = (targetFolderId: string) => {
    if (currentList.isDefault) return;
    triggerHaptic();
    updateListFolder(currentList.id, targetFolderId);
    refreshLists();
    setIsChangeListFolderModalOpen(false);
    const targetFolderObj = folders.find((f) => f.id === targetFolderId);
    showToast(`Список перенесён в папку «${targetFolderObj?.name || 'Разное'}»`);
  };

  const handleRenameList = (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameValue.trim() || currentList.isDefault) return;
    triggerHaptic();
    renameList(currentList.id, renameValue.trim());
    refreshLists();
    setIsRenameModalOpen(false);
  };

  const handleDeleteList = () => {
    if (currentList.isDefault) {
      showToast(t.lists.cannot_delete_default);
      return;
    }
    if (window.confirm(t.lists.delete_confirm)) {
      triggerHaptic();
      deleteList(currentList.id);
      refreshLists();
      handleSelectTab(FAVORITES_ID);
    }
  };

  // Opens Add Items modal and initializes tempSelectedIds
  const handleOpenAddItemsModal = () => {
    triggerHaptic();
    if (currentList.id === FAVORITES_ID) {
      setTempSelectedIds([...getFavoriteIds()]);
    } else {
      setTempSelectedIds([...currentList.itemIds]);
    }
    setItemsSearchQuery('');
    setIsAddItemsModalOpen(true);
  };

  // Toggles item in local modal state
  const handleToggleTempItem = (itemId: string) => {
    triggerHaptic();
    setTempSelectedIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  // Saves local modal state to list or favorites
  const handleSaveAddItems = () => {
    triggerHaptic();
    if (currentList.id === FAVORITES_ID) {
      setFavoriteIds(tempSelectedIds);
    } else {
      const updatedLists = lists.map((l) =>
        l.id === currentList.id ? { ...l, itemIds: tempSelectedIds } : l
      );
      saveLists(updatedLists);
      setLists(updatedLists);
    }
    setIsAddItemsModalOpen(false);
  };

  const handleRemoveItemFromCurrentList = (item: Item, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic();
    if (currentList.id === FAVORITES_ID) {
      toggleFavorite(item.id);
      showToast((t as any).favorites?.removed || 'Убрано из избранного');
    } else {
      removeItemFromList(currentList.id, item.id);
      showToast((t as any).lists?.item_removed || 'Удалено из списка');
    }
    refreshLists();
  };

  const handleShareList = async () => {
    triggerHaptic();
    const listTitle = currentList.isDefault ? t.lists.favorites : currentList.name;

    // Call backend API to create a short shared list ID (e.g. sl_a1b2c3d4)
    let sharedId = await api.createSharedList(listTitle, listItems);

    if (!sharedId) {
      const compactItems = listItems.slice(0, 15).map((i) => ({
        t: i.title,
        c: i.category,
        y: i.release_year,
        g: i.genre,
        r: i.rating,
        pr: i.public_rating,
        p: i.poster_url,
      }));
      const encoded = safeBase64Encode({ title: listTitle, items: compactItems });
      sharedId = `sl_${encoded}`;
    }

    const shareUrl = `https://t.me/manytgbot?startapp=${sharedId}`;

    let shareText = `📋 ${listTitle} (${listItems.length} ${t.lists.items_count})\n\n`;

    listItems.slice(0, 10).forEach((item, index) => {
      shareText += `${index + 1}. ${item.title}`;
      if (item.public_rating && item.public_rating.trim() !== '') {
        shareText += ` — 🍿 ${item.public_rating}`;
      } else if (item.rating && item.rating > 0) {
        shareText += ` — ⭐️ ${item.rating}/10`;
      }
      shareText += '\n';
    });

    if (listItems.length > 10) {
      shareText += `\n... ${t.lists.show_more} ${listItems.length - 10}\n`;
    }

    shareText += `\n➕ Нажми ссылку ниже, чтобы добавить весь список себе в 1 клик:\n${shareUrl}`;

    const fullTelegramShare = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;

    const tg = (window as any).Telegram?.WebApp;
    let opened = false;
    if (tg?.openTelegramLink) {
      try {
        tg.openTelegramLink(fullTelegramShare);
        opened = true;
      } catch (e) {}
    }
    if (!opened) {
      try {
        window.open(fullTelegramShare, '_blank');
      } catch (e) {}
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        showToast(t.lists.list_shared || t.details.link_copied);
      }
    } catch (e) {}
  };

  const userListsOnly = lists.filter((l) => l.id !== FAVORITES_ID);

  // Filter user lists by search query or currently selected folder
  const filteredUserLists = listsSearchQuery
    ? userListsOnly.filter((list) =>
        list.name.toLowerCase().includes(listsSearchQuery.toLowerCase())
      )
    : userListsOnly.filter((list) => {
        if (selectedFolderId === 'all') return true;
        return list.folderId === selectedFolderId;
      });

  return (
    <div className="space-y-4 pb-8 animate-slide-up">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookMarked className="w-5 h-5 text-accentViolet" />
          <h1 className="text-lg font-bold text-white">{t.lists.title}</h1>
        </div>
        <button
          onClick={() => {
            triggerHaptic();
            setNewListName('');
            setNewListFolderId(selectedFolderId !== 'all' ? selectedFolderId : DEFAULT_FOLDER_ID);
            setIsCreateModalOpen(true);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accentViolet/20 border border-accentViolet/40 text-accentViolet hover:bg-accentViolet hover:text-white text-xs font-bold transition active:scale-[0.97] shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>{t.lists.new_list}</span>
        </button>
      </div>

      {/* Lists Search Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="w-4 h-4 text-gray-500" />
        </div>
        <input
          type="text"
          value={listsSearchQuery}
          onChange={(e) => setListsSearchQuery(e.target.value)}
          placeholder={(t as any).lists?.search_lists_placeholder || 'Поиск списков...'}
          className="w-full bg-cardDark border border-cardBorder rounded-xl pl-9 pr-10 py-2 text-sm text-white focus:outline-none focus:border-accentViolet transition-colors placeholder:text-gray-500"
        />
        {listsSearchQuery && (
          <button
            onClick={() => {
              setListsSearchQuery('');
              triggerHaptic();
            }}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Horizontal Scrolling Theme Folders Bar */}
      {!listsSearchQuery && (
        <div className="space-y-1.5 pt-0.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <Folder className="w-3.5 h-3.5 text-accentViolet" />
            <span>{(t as any).lists?.folders_title || 'Тематические папки'}</span>
            <button
              onClick={() => {
                triggerHaptic();
                setIsSortFoldersModalOpen(true);
              }}
              className="ml-2 p-1 text-gray-400 hover:text-white transition active:scale-95"
              title="Настроить папки"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          </span>
          <button
            onClick={() => {
              triggerHaptic();
              setNewFolderName('');
              setIsCreateFolderModalOpen(true);
            }}
            className="text-[11px] font-bold text-accentViolet hover:underline flex items-center gap-1 active:scale-95 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{(t as any).lists?.new_folder || 'Папка'}</span>
          </button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar py-1 px-1 select-none">
          {/* "Все" Folder Tab */}
          <button
            onClick={() => {
              triggerHaptic();
              setSelectedFolderId('all');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition border shrink-0 ${
              selectedFolderId === 'all'
                ? 'bg-accentViolet text-white border-accentViolet shadow-md shadow-accentViolet/30'
                : 'bg-cardDark border-cardBorder text-gray-300 hover:border-gray-600'
            }`}
          >
            <span>🌐 {(t as any).lists?.all_folders || 'Все'}</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${
                selectedFolderId === 'all' ? 'bg-white/20 text-white' : 'bg-bgDark text-gray-400'
              }`}
            >
              {userListsOnly.length}
            </span>
          </button>

          {/* Theme Folders */}
          {folders.map((folder) => {
            const isSelected = selectedFolderId === folder.id;
            const folderListsCount = userListsOnly.filter(
              (l) => l.folderId === folder.id
            ).length;

            return (
              <div key={folder.id} className="relative shrink-0 flex items-center">
                <button
                  onPointerDown={() => {
                    longPressTimerRef.current = setTimeout(() => {
                      longPressTimerRef.current = null;
                      triggerHaptic('medium');
                      setEditingFolder(folder);
                      setFolderRenameValue(folder.name);
                      setIsManageFolderModalOpen(true);
                    }, 400);
                  }}
                  onPointerUp={handlePressEnd}
                  onPointerCancel={handlePressEnd}
                  onContextMenu={(e) => e.preventDefault()}
                  onClick={() => {
                    triggerHaptic();
                    setSelectedFolderId(folder.id);
                  }}
                  style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition border ${
                    isSelected
                      ? 'bg-accentViolet text-white border-accentViolet shadow-md shadow-accentViolet/30'
                      : 'bg-cardDark border-cardBorder text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <span>{folder.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-bgDark text-gray-400'
                    }`}
                  >
                    {folderListsCount}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* All Lists Layout (Filtered by Folder or Search) */}
      <div className="flex items-center justify-between px-1 mt-4 mb-2">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider pl-1">
          {listsSearchQuery ? 'Результаты поиска' : 'Списки в папках'}
        </span>
      </div>
      <div className="relative w-full">
        {filteredUserLists.length > 1 && (
          <button
            onClick={() => {
              triggerHaptic();
              setIsMoreExpanded(!isMoreExpanded);
            }}
            className="absolute top-0 right-0 h-[34px] px-1 text-xs font-bold text-accentViolet flex items-center justify-center transition shrink-0 hover:opacity-70 active:scale-[0.97] select-none z-10"
            title={isMoreExpanded ? 'Свернуть' : 'Ещё'}
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${
                isMoreExpanded ? 'rotate-180' : ''
              }`}
            />
          </button>
        )}

        <div
          className={`flex flex-wrap items-center gap-[6px] w-full py-0.5 transition-all duration-300 ${
            filteredUserLists.length > 1 ? 'pr-7' : ''
          } ${!isMoreExpanded ? 'max-h-[42px] overflow-hidden' : ''}`}
        >
          {/* Tab 1: Favorites (Always accessible only in ALL folder) */}
          {selectedFolderId === 'all' && (
            <button
              onClick={() => handleSelectTab(FAVORITES_ID)}
              className={`px-3.5 py-2 rounded-2xl text-xs font-bold flex items-center gap-1.5 transition border shrink-0 ${
                activeSelectedListId === FAVORITES_ID
                  ? 'bg-accentViolet text-white border-accentViolet shadow-md shadow-accentViolet/30'
                  : 'bg-cardDark border-cardBorder text-gray-300 hover:border-gray-600'
              }`}
              title={t.lists.favorites}
            >
              <Star
                className={`w-4 h-4 ${
                  activeSelectedListId === FAVORITES_ID
                    ? 'fill-white text-white'
                    : 'fill-amber-400 text-amber-400'
                }`}
              />
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${
                  activeSelectedListId === FAVORITES_ID
                    ? 'bg-white/20 text-white'
                    : 'bg-bgDark text-gray-400'
                }`}
              >
                {favoriteIds.filter(id => items.some(item => item.id === id)).length}
              </span>
            </button>
          )}

          {filteredUserLists.length === 0 && (
            <div className="text-xs text-gray-400 py-1.5 px-2 flex items-center gap-2">
              <span>В этой папке пока нет списков</span>
              <button
                onClick={() => {
                  triggerHaptic();
                  setNewListName('');
                  setNewListFolderId(selectedFolderId !== 'all' ? selectedFolderId : DEFAULT_FOLDER_ID);
                  setIsCreateModalOpen(true);
                }}
                className="text-accentViolet font-bold hover:underline"
              >
                + Создать
              </button>
            </div>
          )}

          {/* Filtered Custom Lists */}
          {filteredUserLists.map((list) => {
            const isSelected = list.id === activeSelectedListId;
            const isDragging = list.id === dragState?.list.id;
            const validCount = list.itemIds.filter(id => items.some(item => item.id === id)).length;

            return (
              <button
                key={list.id}
                data-list-id={list.id}
                onClick={() => handleSelectTab(list.id)}
                onTouchStart={(e) => handlePressStart(list, e)}
                onTouchEnd={handlePressEnd}
                onMouseDown={(e) => handlePressStart(list, e)}
                onMouseUp={handlePressEnd}
                onMouseLeave={handlePressEnd}
                className={`px-3.5 py-2 rounded-2xl text-xs font-bold flex items-center gap-2 transition border select-none shrink-0 ${
                  isSelected
                    ? 'bg-accentViolet text-white border-accentViolet shadow-md shadow-accentViolet/30'
                    : 'bg-cardDark border-cardBorder text-gray-300 hover:border-gray-600'
                } ${
                  isDragging
                    ? 'opacity-40 border-dashed border-accentViolet/60 bg-accentViolet/10'
                    : ''
                }`}
              >
                <span className="truncate">{list.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold shrink-0 ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-bgDark text-gray-400'
                  }`}
                >
                  {validCount}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Floating Dragged Pill ("Летит по экрану") */}
      {dragState &&
        createPortal(
          <div
            ref={overlayRef}
            style={{
              position: 'fixed',
              left: 0,
              top: 0,
              transform: `translate3d(${dragState.x - dragState.offsetX}px, ${dragState.y - dragState.offsetY}px, 0) scale(1.08)`,
              width: `${dragState.width}px`,
              height: `${dragState.height}px`,
              pointerEvents: 'none',
              zIndex: 9999,
              willChange: 'transform',
            }}
            className="px-3.5 py-2 rounded-2xl text-xs font-bold flex items-center justify-between gap-2 bg-accentViolet text-white border-2 border-white/90 shadow-2xl opacity-95 transition-transform duration-75 cursor-grabbing"
          >
            <span className="truncate">{dragState.list.name}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-extrabold bg-white/20 text-white shrink-0">
              {dragState.list.itemIds.filter(id => items.some(item => item.id === id)).length}
            </span>
          </div>,
          document.body
        )}

      {/* Current List Action Header Card */}
      <div className="glass-card p-4 rounded-3xl space-y-3 shadow-lg border border-cardBorder">
        {/* Top Row: List Title & Item Count */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {currentList.isDefault ? (
              <Star className="w-5 h-5 fill-amber-400 text-amber-400 shrink-0" />
            ) : (
              <BookMarked className="w-5 h-5 text-accentViolet shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold text-white truncate">
                {currentList.isDefault ? t.lists.favorites : currentList.name}
              </h2>
              <p className="text-[11px] text-gray-400">
                {listItems.length} {t.lists.items_count}
              </p>
            </div>
          </div>

          {/* Folder pill badge for custom list */}
          {!currentList.isDefault && (
            <button
              onClick={() => {
                triggerHaptic();
                setIsChangeListFolderModalOpen(true);
              }}
              className="px-2.5 py-1 rounded-xl bg-cardDark border border-cardBorder hover:border-accentViolet/50 text-[11px] font-semibold text-gray-300 hover:text-white flex items-center gap-1.5 shrink-0 transition active:scale-95 shadow-sm"
              title={(t as any).lists?.change_folder || 'Сменить папку'}
            >
              <Folder className="w-3.5 h-3.5 text-accentViolet" />
              <span>
                {folders.find((f) => f.id === (currentList.folderId || DEFAULT_FOLDER_ID))?.name || 'Разное'}
              </span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>
          )}
        </div>

        {/* Bottom Row: Action Buttons (Share, Edit, Delete, "+ Добавить") */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-cardBorder/50">
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleShareList}
              className="p-2 rounded-xl bg-cardDark border border-cardBorder text-accentTeal hover:bg-accentTeal/10 transition active:scale-[0.97]"
              title={t.lists.share}
            >
              <Share2 className="w-4 h-4" />
            </button>

            {!currentList.isDefault && (
              <>
                <button
                  onClick={() => {
                    setRenameValue(currentList.name);
                    setIsRenameModalOpen(true);
                  }}
                  className="p-2 rounded-xl bg-cardDark border border-cardBorder text-accentViolet hover:bg-accentViolet/10 transition active:scale-[0.97]"
                  title={t.lists.rename}
                >
                  <Edit2 className="w-4 h-4" />
                </button>

                <button
                  onClick={handleDeleteList}
                  className="p-2 rounded-xl bg-cardDark border border-cardBorder text-red-400 hover:bg-red-500/10 transition active:scale-[0.97]"
                  title={t.lists.delete}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* AI Recommendations Button (Magic Wand) */}
            <button
              onClick={handleGetRecommendations}
              disabled={cooldownLeft > 0}
              className={`p-2 rounded-xl border transition active:scale-[0.97] shrink-0 flex items-center justify-center gap-1 font-bold text-xs ${
                cooldownLeft > 0
                  ? 'bg-cardDark/50 border-cardBorder/60 text-gray-500 cursor-not-allowed opacity-70'
                  : 'bg-gradient-to-r from-amber-500/20 to-purple-500/20 border-amber-500/50 text-amber-300 hover:border-amber-400 hover:brightness-110 shadow-sm shadow-amber-500/10'
              }`}
              title={cooldownLeft > 0 ? `Повтор через ${cooldownLeft}с` : 'ИИ-рекомендации'}
            >
              <Wand2 className={`w-4 h-4 ${cooldownLeft > 0 ? 'opacity-50 animate-pulse' : 'text-amber-400'}`} />
              {cooldownLeft > 0 && <span className="text-[10px] font-mono font-bold text-amber-400/90">{cooldownLeft}s</span>}
            </button>

            {/* Add items button (icon-only) */}
            <button
              onClick={handleOpenAddItemsModal}
              className="p-2 rounded-xl bg-accentViolet text-white shadow-md hover:bg-opacity-90 transition active:scale-[0.97] shrink-0 flex items-center justify-center"
              title={t.lists.add_items}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Subheader count & sort buttons for current list */}
      {listItems.length > 0 && (
        <div className="flex items-center justify-between text-xs text-gray-400 px-1 pt-1 pb-0.5">
          <span>
            {sortedListItems.length} {t.details.elements_count}
          </span>
          <div className="flex items-center gap-3">
            {/* Sort by Year */}
            <button
              onClick={() => {
                triggerHaptic();
                if (sortBy === 'year') {
                  setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                } else {
                  setSortBy('year');
                  setSortOrder('desc');
                }
              }}
              className={`flex items-center gap-1 font-medium transition active:scale-[0.97] ${
                sortBy === 'year' ? 'text-accentViolet font-semibold' : 'text-gray-300 hover:text-white'
              }`}
              title={t.details.by_year}
            >
              <span>{t.details.by_year}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  sortBy === 'year'
                    ? sortOrder === 'asc'
                      ? 'rotate-180 text-accentViolet'
                      : 'text-accentViolet'
                    : 'text-gray-400'
                }`}
              />
            </button>

            {/* Sort by Date */}
            <button
              onClick={() => {
                triggerHaptic();
                if (sortBy === 'date') {
                  setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                } else {
                  setSortBy('date');
                  setSortOrder('desc');
                }
              }}
              className={`flex items-center gap-1 font-medium transition active:scale-[0.97] ${
                sortBy === 'date' ? 'text-accentViolet font-semibold' : 'text-gray-300 hover:text-white'
              }`}
              title={t.details.by_date}
            >
              <span>{t.details.by_date}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  sortBy === 'date'
                    ? sortOrder === 'asc'
                      ? 'rotate-180 text-accentViolet'
                      : 'text-accentViolet'
                    : 'text-gray-400'
                }`}
              />
            </button>

            {/* Sort by Rating */}
            <button
              onClick={() => {
                if (sortBy === 'rating') {
                  setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                } else {
                  setSortBy('rating');
                  setSortOrder('desc');
                }
              }}
              className={`flex items-center gap-1 font-medium transition active:scale-[0.97] ${
                sortBy === 'rating' ? 'text-accentViolet font-semibold' : 'text-gray-300 hover:text-white'
              }`}
              title={t.details.public_rating || 'Рейтинг'}
            >
              <span>{t.details.public_rating || 'Рейтинг'}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  sortBy === 'rating'
                    ? sortOrder === 'asc'
                      ? 'rotate-180 text-accentViolet'
                      : 'text-accentViolet'
                    : 'text-gray-400'
                }`}
              />
            </button>
          </div>
        </div>
      )}

      {/* Items list */}
      {sortedListItems.length > 0 ? (
        <div className="space-y-2.5">
          {sortedListItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onSelect={onSelectItem}
              onRemoveFromList={handleRemoveItemFromCurrentList}
              onUpdateItem={onUpdateItem}
              t={t}
            />
          ))}
        </div>
      ) : (
        <div className="glass-card p-8 rounded-3xl text-center space-y-3 border-dashed">
          {currentList.isDefault ? (
            <>
              <Star className="w-10 h-10 mx-auto text-amber-400 opacity-60" />
              <p className="text-xs text-gray-300 font-medium">{t.lists.empty_favorites}</p>
              <button
                onClick={handleOpenAddItemsModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accentViolet text-white text-xs font-bold shadow-md hover:bg-opacity-90 transition"
              >
                <Plus className="w-4 h-4" />
                <span>{t.lists.add_items}</span>
              </button>
            </>
          ) : (
            <>
              <BookMarked className="w-10 h-10 mx-auto text-accentViolet opacity-60" />
              <p className="text-xs text-gray-300 font-medium">{t.lists.empty_list}</p>
              <button
                onClick={handleOpenAddItemsModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accentViolet text-white text-xs font-bold shadow-md hover:bg-opacity-90 transition"
              >
                <Plus className="w-4 h-4" />
                <span>{t.lists.add_items}</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-accentViolet/95 backdrop-blur-md text-white text-xs font-semibold px-4 py-2.5 rounded-2xl shadow-2xl animate-fade-in text-center max-w-[85vw] border border-white/20">
          {toastMessage}
        </div>
      )}

      {/* Modal: Create List */}
      {isCreateModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-cardDark border border-cardBorder rounded-3xl p-5 space-y-4 animate-slide-up shadow-2xl">
              <div className="flex items-center justify-between border-b border-cardBorder pb-2">
                <h3 className="text-base font-bold text-white">{t.lists.new_list}</h3>
                <button onClick={() => setIsCreateModalOpen(false)} className="text-gray-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateList} className="space-y-4">
                <div>
                  <label className="text-xs text-gray-400 font-semibold mb-1 block">
                    {t.modal.title_label}
                  </label>
                  <input
                    type="text"
                    autoFocus
                    required
                    maxLength={50}
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder={t.lists.create_name_placeholder}
                    className="w-full bg-bgDark border border-cardBorder rounded-xl p-3 text-sm text-white focus:outline-none focus:border-accentViolet"
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-400 font-semibold mb-1.5 flex items-center justify-between">
                    <span>{(t as any).lists?.select_folder || 'Папка для списка'}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreateModalOpen(false);
                        setNewFolderName('');
                        setIsCreateFolderModalOpen(true);
                      }}
                      className="text-accentViolet hover:underline font-bold text-[11px]"
                    >
                      + {(t as any).lists?.new_folder || 'Новая папка'}
                    </button>
                  </label>
                  <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto hide-scrollbar p-0.5">
                    {folders.map((f) => {
                      const isSelected = (newListFolderId || DEFAULT_FOLDER_ID) === f.id;

                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            triggerHaptic();
                            setNewListFolderId(f.id);
                          }}
                          className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition text-left ${
                            isSelected
                              ? 'bg-accentViolet/20 border-accentViolet text-white font-bold'
                              : 'bg-bgDark border-cardBorder text-gray-300 hover:border-gray-600'
                          }`}
                        >
                          <span className="truncate">{f.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-cardBorder text-gray-300 text-xs font-medium"
                  >
                    {t.lists.cancel_btn}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-accentViolet text-white text-xs font-bold shadow-md hover:bg-opacity-90 transition"
                  >
                    {t.lists.create_btn}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Modal: Create Folder */}
      {isCreateFolderModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-cardDark border border-cardBorder rounded-3xl p-5 space-y-4 animate-slide-up shadow-2xl">
              <div className="flex items-center justify-between border-b border-cardBorder pb-2">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FolderPlus className="w-5 h-5 text-accentViolet" />
                  <span>{(t as any).lists?.create_folder || 'Создать папку'}</span>
                </h3>
                <button onClick={() => setIsCreateFolderModalOpen(false)} className="text-gray-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateFolder} className="space-y-4">
                <div>
                  <label className="text-xs text-gray-400 font-semibold mb-1 block">Название папки</label>
                  <input
                    type="text"
                    maxLength={100}
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder={(t as any).lists?.folder_name_placeholder || 'Название папки...'}
                    className="w-full bg-bgDark border border-cardBorder rounded-xl p-3 text-sm text-white focus:outline-none focus:border-accentViolet"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsCreateFolderModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-cardBorder text-gray-300 text-xs font-medium"
                  >
                    {t.lists.cancel_btn}
                  </button>
                  <button
                    type="submit"
                    disabled={!newFolderName.trim()}
                    className="px-4 py-2 rounded-xl bg-accentViolet text-white text-xs font-bold shadow-md hover:bg-opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t.lists.create_btn}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Modal: Manage / Edit Folder */}
      {isManageFolderModalOpen && editingFolder &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-cardDark border border-cardBorder rounded-3xl p-5 space-y-4 animate-slide-up shadow-2xl">
              <div className="flex items-center justify-between border-b border-cardBorder pb-2">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Folder className="w-5 h-5 text-accentViolet" />
                  <span>{(t as any).lists?.rename_folder || 'Настройки папки'}</span>
                </h3>
                <button
                  onClick={() => {
                    setIsManageFolderModalOpen(false);
                    setEditingFolder(null);
                  }}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleRenameFolder} className="space-y-4">
                <div>
                  <label className="text-xs text-gray-400 font-semibold mb-1 block">Название папки</label>
                  <input
                    type="text"
                    maxLength={100}
                    value={folderRenameValue}
                    onChange={(e) => setFolderRenameValue(e.target.value)}
                    className="w-full bg-bgDark border border-cardBorder rounded-xl p-3 text-sm text-white focus:outline-none focus:border-accentViolet"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={handleDeleteFolder}
                    className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold hover:bg-red-500 hover:text-white transition flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Удалить</span>
                  </button>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsManageFolderModalOpen(false);
                        setEditingFolder(null);
                      }}
                      className="px-4 py-2 rounded-xl border border-cardBorder text-gray-300 text-xs font-medium"
                    >
                      {t.lists.cancel_btn}
                    </button>
                    <button
                      type="submit"
                      disabled={!folderRenameValue.trim()}
                      className="px-4 py-2 rounded-xl bg-accentViolet text-white text-xs font-bold shadow-md hover:bg-opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t.modal.save}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Modal: Change List Folder */}
      {isChangeListFolderModalOpen && !currentList.isDefault &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-cardDark border border-cardBorder rounded-3xl p-5 space-y-4 animate-slide-up shadow-2xl">
              <div className="flex items-center justify-between border-b border-cardBorder pb-2">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FolderOpen className="w-5 h-5 text-accentViolet" />
                  <span>{(t as any).lists?.change_folder || 'Сменить папку'}</span>
                </h3>
                <button
                  onClick={() => setIsChangeListFolderModalOpen(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-gray-300">
                  Выберите папку для списка «<span className="font-bold text-white">{currentList.name}</span>»:
                </p>
                <div className="space-y-2 max-h-60 overflow-y-auto hide-scrollbar pt-1">
                  {folders.map((f) => {
                    const isCurrentFolder = (currentList.folderId || DEFAULT_FOLDER_ID) === f.id;

                    return (
                      <div
                        key={f.id}
                        onClick={() => handleChangeListFolder(f.id)}
                        className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition select-none ${
                          isCurrentFolder
                            ? 'bg-accentViolet/20 border-accentViolet shadow-sm'
                            : 'bg-bgDark border-cardBorder hover:border-gray-600'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-sm font-bold text-white">{f.name}</span>
                        </div>
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center transition border ${
                            isCurrentFolder
                              ? 'bg-accentViolet border-accentViolet text-white'
                              : 'border-cardBorder bg-bgDark text-transparent'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 border-t border-cardBorder/60 flex items-center justify-between">
                <button
                  onClick={() => {
                    setIsChangeListFolderModalOpen(false);
                    setNewFolderName('');
                    setIsCreateFolderModalOpen(true);
                  }}
                  className="text-xs font-bold text-accentViolet hover:underline flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  <span>{(t as any).lists?.new_folder || 'Новая папка'}</span>
                </button>
                <button
                  onClick={() => setIsChangeListFolderModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-cardBorder text-gray-300 text-xs font-medium"
                >
                  {t.lists.cancel_btn}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Modal: Rename List */}
      {isRenameModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-cardDark border border-cardBorder rounded-3xl p-5 space-y-4 animate-slide-up shadow-2xl">
              <div className="flex items-center justify-between border-b border-cardBorder pb-2">
                <h3 className="text-base font-bold text-white">{t.lists.rename}</h3>
                <button onClick={() => setIsRenameModalOpen(false)} className="text-gray-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleRenameList} className="space-y-4">
                <input
                  type="text"
                  autoFocus
                  required
                  maxLength={50}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  placeholder={t.lists.rename_placeholder}
                  className="w-full bg-bgDark border border-cardBorder rounded-xl p-3 text-sm text-white focus:outline-none focus:border-accentViolet"
                />

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsRenameModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-cardBorder text-gray-300 text-xs font-medium"
                  >
                    {t.lists.cancel_btn}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-accentViolet text-white text-xs font-bold shadow-md hover:bg-opacity-90"
                  >
                    {t.modal.save}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* ITEM 5 FIX: Rendered via createPortal to document.body! Perfectly centered, no jumping or bottom clipping! */}
      {isAddItemsModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
            <div className="w-full max-w-md bg-cardDark border border-cardBorder rounded-3xl p-5 space-y-4 animate-slide-up max-h-[82vh] flex flex-col shadow-2xl">
              <div className="flex items-center justify-between border-b border-cardBorder pb-2 shrink-0">
                <h3 className="text-base font-bold text-white">{t.lists.add_items}</h3>
                <button onClick={() => setIsAddItemsModalOpen(false)} className="text-gray-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Search filter */}
              <div className="relative shrink-0">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                <input
                  type="text"
                  maxLength={100}
                  value={itemsSearchQuery}
                  onChange={(e) => setItemsSearchQuery(e.target.value)}
                  placeholder={t.details.search_placeholder}
                  className="w-full bg-bgDark border border-cardBorder rounded-xl pl-9 pr-4 py-2.5 text-xs text-white placeholder-gray-400 focus:outline-none focus:border-accentViolet"
                />
              </div>

              {/* Items Checkbox List */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 hide-scrollbar">
                {items
                  .filter((item) =>
                    itemsSearchQuery
                      ? item.title.toLowerCase().includes(itemsSearchQuery.toLowerCase()) ||
                        (item.genre && item.genre.toLowerCase().includes(itemsSearchQuery.toLowerCase()))
                      : true
                  )
                  .map((item) => {
                    const isInTemp = tempSelectedIds.includes(item.id);
                    const categoryLabel = formatCategorySingle(item.category, t);
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleToggleTempItem(item.id)}
                        className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition select-none ${
                          isInTemp
                            ? 'bg-accentViolet/20 border-accentViolet shadow-sm'
                            : 'bg-bgDark border-cardBorder hover:border-gray-600'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 pr-2">
                          {item.poster_url ? (
                            <img
                              src={item.poster_url}
                              alt=""
                              className="w-9 h-12 object-cover rounded-xl shrink-0 bg-gray-800"
                            />
                          ) : (
                            <div className="w-9 h-12 bg-gray-800 rounded-xl flex items-center justify-center text-[10px] text-gray-400 font-bold shrink-0">
                              {item.title.charAt(0)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-white truncate">{item.title}</h4>
                            <p className="text-[10px] text-gray-400">
                              {categoryLabel} {item.release_year ? `• ${item.release_year}` : ''}
                            </p>
                          </div>
                        </div>

                        <div
                          className={`w-6 h-6 rounded-lg flex items-center justify-center transition border shrink-0 ${
                            isInTemp
                              ? 'bg-accentViolet border-accentViolet text-white'
                              : 'border-cardBorder bg-bgDark text-transparent'
                          }`}
                        >
                          <Check className="w-4 h-4 stroke-[3]" />
                        </div>
                      </div>
                    );
                  })}
              </div>

              <button
                onClick={handleSaveAddItems}
                className="w-full py-3 rounded-xl bg-accentViolet text-white font-bold text-xs shadow-lg hover:bg-opacity-90 transition shrink-0"
              >
                {t.modal.save}
              </button>
            </div>
          </div>,
          document.body
        )}

      {/* Sort Folders Modal */}
      {isSortFoldersModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
            <div className="w-full max-w-md bg-cardDark border border-cardBorder rounded-3xl p-5 space-y-4 animate-slide-up shadow-2xl">
              <div className="flex items-center justify-between border-b border-cardBorder pb-2 shrink-0">
                <h3 className="text-base font-bold text-white">Порядок папок</h3>
                <button onClick={() => setIsSortFoldersModalOpen(false)} className="text-gray-400 hover:text-white transition">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 max-h-[50vh] hide-scrollbar pr-1">
                {folders.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">Нет папок для сортировки</p>
                ) : (
                  folders.map((folder, index) => (
                    <div key={folder.id} className="flex items-center justify-between p-3 rounded-2xl bg-bgDark border border-cardBorder">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{folder.icon || '📁'}</span>
                        <span className="text-xs font-bold text-white">{folder.name}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => {
                            if (index > 0) {
                              triggerHaptic();
                              const newF = [...folders];
                              [newF[index - 1], newF[index]] = [newF[index], newF[index - 1]];
                              setFolders(newF);
                              saveFolders(newF);
                            }
                          }}
                          disabled={index === 0}
                          className={`p-1 rounded-md transition ${index === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-cardBorder text-gray-400 hover:text-white'}`}
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (index < folders.length - 1) {
                              triggerHaptic();
                              const newF = [...folders];
                              [newF[index + 1], newF[index]] = [newF[index], newF[index + 1]];
                              setFolders(newF);
                              saveFolders(newF);
                            }
                          }}
                          disabled={index === folders.length - 1}
                          className={`p-1 rounded-md transition ${index === folders.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-cardBorder text-gray-400 hover:text-white'}`}
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <button
                onClick={() => setIsSortFoldersModalOpen(false)}
                className="w-full py-3 rounded-xl bg-accentViolet text-white font-bold text-xs shadow-lg hover:bg-opacity-90 transition mt-2"
              >
                Готово
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
