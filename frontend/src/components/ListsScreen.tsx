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
} from 'lucide-react';
import { Item } from '../types';
import {
  UserList,
  getLists,
  saveLists,
  createList,
  renameList,
  deleteList,
  removeItemFromList,
  FAVORITES_ID,
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
  selectedListId: selectedListIdProp,
  onSelectList,
  initialListId,
  t,
}) => {
  const [lists, setLists] = useState<UserList[]>(() => getLists());
  const [selectedListIdState, setSelectedListIdState] = useState<string>(
    selectedListIdProp || initialListId || FAVORITES_ID
  );

  const activeSelectedListId = selectedListIdProp || selectedListIdState;

  useEffect(() => {
    if (selectedListIdProp && selectedListIdProp !== selectedListIdState) {
      setSelectedListIdState(selectedListIdProp);
    }
  }, [selectedListIdProp]);

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

  const [sortBy, setSortBy] = useState<'date' | 'year'>('date');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Get items belonging to selected list
  const favoriteIds = getFavoriteIds();
  const listItems = items.filter((item) => {
    if (currentList.id === FAVORITES_ID) {
      return favoriteIds.includes(item.id);
    }
    return currentList.itemIds.includes(item.id);
  });

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
    const created = createList(newListName.trim());
    refreshLists();
    handleSelectTab(created.id);
    setNewListName('');
    setIsCreateModalOpen(false);
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
        p: i.poster_url,
      }));
      const encoded = safeBase64Encode({ title: listTitle, items: compactItems });
      sharedId = `sl_${encoded}`;
    }

    const shareUrl = `https://t.me/manytgbot?startapp=${sharedId}`;

    let shareText = `📋 ${listTitle} (${listItems.length} ${t.lists.items_count})\n\n`;

    listItems.slice(0, 10).forEach((item, index) => {
      shareText += `${index + 1}. ${item.title}`;
      if (item.rating && item.rating > 0) shareText += ` — ⭐️ ${item.rating}/10`;
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
  const secondList = userListsOnly[0]; // Always stays as first custom list in custom user order

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
            setIsCreateModalOpen(true);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accentViolet/20 border border-accentViolet/40 text-accentViolet hover:bg-accentViolet text-xs font-bold transition active:scale-95 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>{t.lists.new_list}</span>
        </button>
      </div>

      {/* All Lists Layout (Top row & Wrapped Expanded row) */}
      <div className="flex flex-wrap items-center gap-2 w-full">
        {/* Tab 1: Favorites (Compact: [ ⭐ count ]) */}
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
            {favoriteIds.length}
          </span>
        </button>

        {userListsOnly.length === 0 && <div className="flex-1" />}

        {/* Custom Lists & "Ещё" Button */}
        {userListsOnly.map((list, index) => {
          const isFirstCustom = index === 0;
          // Hide subsequent lists if not expanded
          const isHidden = !isMoreExpanded && !isFirstCustom;
          const isSelected = list.id === activeSelectedListId;
          const isDragging = list.id === dragState?.list.id;

          return (
            <React.Fragment key={list.id}>
              <button
                data-list-id={list.id}
                style={{ display: isHidden ? 'none' : 'flex' }}
                onClick={() => handleSelectTab(list.id)}
                onTouchStart={(e) => handlePressStart(list, e)}
                onTouchEnd={handlePressEnd}
                onMouseDown={(e) => handlePressStart(list, e)}
                onMouseUp={handlePressEnd}
                onMouseLeave={handlePressEnd}
                className={`px-3.5 py-2 rounded-2xl text-xs font-bold items-center gap-2 transition border select-none ${
                  isFirstCustom ? 'flex-1 min-w-0 justify-between' : 'shrink-0'
                } ${!isFirstCustom && isMoreExpanded ? 'animate-slide-up mt-1' : ''} ${
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
                  {list.itemIds.length}
                </span>
              </button>

              {/* Render More button immediately after the first custom list to keep it on the top row */}
              {isFirstCustom && userListsOnly.length > 1 && (
                <React.Fragment key="more-btn-group">
                  <button
                    onClick={() => {
                      triggerHaptic();
                      setIsMoreExpanded(!isMoreExpanded);
                    }}
                    className="px-2 py-2 text-xs font-bold text-accentViolet flex items-center gap-1 transition shrink-0 hover:opacity-70 active:scale-95 select-none"
                  >
                    <span>Ещё</span>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform duration-200 ${
                        isMoreExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {/* Force flex line break so remaining lists go to the next line without squishing the first capsule */}
                  <div className="basis-full h-0 m-0 p-0" />
                </React.Fragment>
              )}
            </React.Fragment>
          );
        })}
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
              {dragState.list.itemIds.length}
            </span>
          </div>,
          document.body
        )}

      {/* Current List Action Header Card */}
      <div className="glass-card p-4 rounded-3xl space-y-3 shadow-lg border border-cardBorder">
        {/* Top Row: List Title & Item Count */}
        <div className="flex items-center gap-2.5">
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

        {/* Bottom Row: Action Buttons (Share, Edit, Delete, "+ Добавить") */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-cardBorder/50">
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleShareList}
              className="p-2 rounded-xl bg-cardDark border border-cardBorder text-accentTeal hover:bg-accentTeal/10 transition active:scale-95"
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
                  className="p-2 rounded-xl bg-cardDark border border-cardBorder text-accentViolet hover:bg-accentViolet/10 transition active:scale-95"
                  title={t.lists.rename}
                >
                  <Edit2 className="w-4 h-4" />
                </button>

                <button
                  onClick={handleDeleteList}
                  className="p-2 rounded-xl bg-cardDark border border-cardBorder text-red-400 hover:bg-red-500/10 transition active:scale-95"
                  title={t.lists.delete}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>

          {/* ITEM 3 FIX: "+ Добавить" button is ALWAYS present, even for Favorites! */}
          {/* ITEM 2 FIX: Button text is "+ Добавить" (without "элементы") */}
          <button
            onClick={handleOpenAddItemsModal}
            className="flex items-center gap-1 px-3.5 py-2 rounded-xl bg-accentViolet text-white text-xs font-bold shadow-md hover:bg-opacity-90 transition active:scale-95 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Добавить</span>
          </button>
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
              className={`flex items-center gap-1 font-medium transition active:scale-95 ${
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
              className={`flex items-center gap-1 font-medium transition active:scale-95 ${
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
                <span>Добавить</span>
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
                <span>Добавить</span>
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

      {/* Modal: Create List (ITEM 5 FIX: Rendered via createPortal to document.body to prevent layout/scroll jumping) */}
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
                <input
                  type="text"
                  autoFocus
                  required
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder={t.lists.create_name_placeholder}
                  className="w-full bg-bgDark border border-cardBorder rounded-xl p-3 text-sm text-white focus:outline-none focus:border-accentViolet"
                />

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
                    className="px-4 py-2 rounded-xl bg-accentViolet text-white text-xs font-bold shadow-md hover:bg-opacity-90"
                  >
                    {t.lists.create_btn}
                  </button>
                </div>
              </form>
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
    </div>
  );
};
