import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { Item } from '../types';
import {
  UserList,
  getLists,
  saveLists,
  createList,
  renameList,
  deleteList,
  addItemToList,
  removeItemFromList,
  FAVORITES_ID,
} from '../services/lists';
import { getFavoriteIds } from '../services/favorites';
import { ItemCard } from './ItemCard';
import { Translations, formatCategorySingle } from '../services/i18n';
import { api } from '../services/api';

interface ListsScreenProps {
  items: Item[];
  onSelectItem: (item: Item) => void;
  onToggleStatus: (item: Item, e: React.MouseEvent) => void;
  t: Translations;
  initialListId?: string;
}

export const ListsScreen: React.FC<ListsScreenProps> = ({
  items,
  onSelectItem,
  onToggleStatus,
  t,
  initialListId,
}) => {
  const [lists, setLists] = useState<UserList[]>(() => getLists());
  const [selectedListId, setSelectedListId] = useState<string>(initialListId || FAVORITES_ID);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newListName, setNewListName] = useState('');

  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  // Add Items Modal state — uses local state tempSelectedIds to prevent layout shifts!
  const [isAddItemsModalOpen, setIsAddItemsModalOpen] = useState(false);
  const [tempSelectedIds, setTempSelectedIds] = useState<string[]>([]);
  const [itemsSearchQuery, setItemsSearchQuery] = useState('');

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const refreshLists = () => {
    const updated = getLists();
    setLists(updated);
  };

  const triggerHaptic = () => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.impactOccurred('light');
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const currentList = lists.find((l) => l.id === selectedListId) || lists[0];

  // Get items belonging to selected list
  const favoriteIds = getFavoriteIds();
  const listItems = items.filter((item) => {
    if (currentList.id === FAVORITES_ID) {
      return favoriteIds.includes(item.id);
    }
    return currentList.itemIds.includes(item.id);
  });

  const handleCreateList = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    triggerHaptic();
    const created = createList(newListName.trim());
    refreshLists();
    setSelectedListId(created.id);
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
      setSelectedListId(FAVORITES_ID);
    }
  };

  // Opens Add Items modal and initializes tempSelectedIds
  const handleOpenAddItemsModal = () => {
    triggerHaptic();
    setTempSelectedIds([...currentList.itemIds]);
    setItemsSearchQuery('');
    setIsAddItemsModalOpen(true);
  };

  // Toggles item in local modal state (no parent re-renders/jumps!)
  const handleToggleTempItem = (itemId: string) => {
    triggerHaptic();
    setTempSelectedIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  // Saves local modal state to list
  const handleSaveAddItems = () => {
    triggerHaptic();
    const updatedLists = lists.map((l) =>
      l.id === currentList.id ? { ...l, itemIds: tempSelectedIds } : l
    );
    saveLists(updatedLists);
    setLists(updatedLists);
    setIsAddItemsModalOpen(false);
  };

  const handleShareList = async () => {
    triggerHaptic();
    const listTitle = currentList.isDefault ? t.lists.favorites : currentList.name;

    // Try backend shared list API first
    let sharedId = await api.createSharedList(listTitle, listItems);
    let shareUrl = '';

    if (sharedId) {
      shareUrl = `https://t.me/manytgbot?startapp=sharedlist_${sharedId}`;
    } else {
      // Fallback encoding
      try {
        const compactData = {
          title: listTitle,
          items: listItems.map((i) => ({
            t: i.title,
            c: i.category,
            y: i.release_year,
            g: i.genre,
            p: i.poster_url,
            d: i.duration,
            r: i.rating,
          })),
        };
        const encoded = btoa(encodeURIComponent(JSON.stringify(compactData)));
        shareUrl = `https://t.me/manytgbot?startapp=sharedlist_${encoded}`;
      } catch {
        shareUrl = `https://t.me/manytgbot`;
      }
    }

    let shareText = `📋 **${listTitle}** (${listItems.length} ${t.lists.items_count})\n\n`;

    listItems.slice(0, 10).forEach((item, index) => {
      shareText += `${index + 1}. ${item.title}`;
      if (item.rating && item.rating > 0) shareText += ` — ⭐️ ${item.rating}/10`;
      shareText += '\n';
    });

    if (listItems.length > 10) {
      shareText += `\n... ${t.lists.show_more} ${listItems.length - 10}\n`;
    }

    shareText += `\n➕ Нажми ссылку ниже, чтобы добавить весь список себе в 1 клик!`;

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

      {/* Horizontal List Selector / Tabs (ITEM 5: No icons except Star for Favorites!) */}
      <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
        {lists.map((list) => {
          const isSelected = list.id === selectedListId;
          const isFav = list.id === FAVORITES_ID;
          const itemCount = isFav ? favoriteIds.length : list.itemIds.length;

          return (
            <button
              key={list.id}
              onClick={() => {
                triggerHaptic();
                setSelectedListId(list.id);
              }}
              className={`px-4 py-2 rounded-2xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition border shrink-0 ${
                isSelected
                  ? 'bg-accentViolet text-white border-accentViolet shadow-md shadow-accentViolet/30'
                  : 'bg-cardDark border-cardBorder text-gray-300 hover:border-gray-600'
              }`}
            >
              {/* Only show Star icon for Favorites (Item 5) */}
              {isFav && (
                <Star
                  className={`w-3.5 h-3.5 ${
                    isSelected ? 'fill-white text-white' : 'fill-amber-400 text-amber-400'
                  }`}
                />
              )}
              <span>{isFav ? t.lists.favorites : list.name}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-bgDark text-gray-400'
                }`}
              >
                {itemCount}
              </span>
            </button>
          );
        })}
      </div>

      {/* ITEM 1 FIX: Title on Top, Action Buttons on Bottom row so nothing overflows! */}
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

        {/* Bottom Row: Action Buttons (Share, Edit, Delete, Add Items) */}
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

          {!currentList.isDefault && (
            <button
              onClick={handleOpenAddItemsModal}
              className="flex items-center gap-1 px-3.5 py-2 rounded-xl bg-accentViolet text-white text-xs font-bold shadow-md hover:bg-opacity-90 transition active:scale-95 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t.lists.add_items}</span>
            </button>
          )}
        </div>
      </div>

      {/* Items list */}
      {listItems.length > 0 ? (
        <div className="space-y-2.5">
          {listItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onSelect={onSelectItem}
              onToggleStatus={onToggleStatus}
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
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
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
        </div>
      )}

      {/* Modal: Rename List */}
      {isRenameModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
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
        </div>
      )}

      {/* ITEM 2 FIX: Clean Centered Modal Dialog for Add Items + Local State to prevent shifts & translates categories */}
      {isAddItemsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
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
        </div>
      )}
    </div>
  );
};
