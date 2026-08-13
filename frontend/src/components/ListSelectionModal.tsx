import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Plus, FolderPlus, Star, Search, ChevronDown } from 'lucide-react';
import { Item } from '../types';
import { Translations } from '../services/i18n';
import { getLists, saveLists, createList, getFolders, DEFAULT_FOLDER_ID, FAVORITES_ID, UserList, ListFolder } from '../services/lists';
import { getFavoriteIds, setFavoriteIds } from '../services/favorites';

import { ru } from '../locales/ru';

interface ListSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: Item;
  t?: Translations;
  onSave?: () => void;
}

export const ListSelectionModal: React.FC<ListSelectionModalProps> = ({
  isOpen,
  onClose,
  item,
  t,
  onSave,
}) => {
  const trans = t || ru;
  const [userLists, setUserLists] = useState<UserList[]>([]);
  const [folders, setFolders] = useState<ListFolder[]>([]);
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string>(DEFAULT_FOLDER_ID);
  const [isFolderDropdownOpen, setIsFolderDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFolderId, setFilterFolderId] = useState<string | null>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  const triggerHaptic = () => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.impactOccurred('light');
    }
  };

  useEffect(() => {
    if (!isOpen || !item) return;

    const allLists = getLists();
    setUserLists(allLists);
    setFolders(getFolders());

    const initialSelected: string[] = [];
    const favs = getFavoriteIds();
    if (favs.includes(item.id)) {
      initialSelected.push(FAVORITES_ID);
    }
    allLists.forEach((l) => {
      if (!l.isDefault && l.itemIds.includes(item.id)) {
        initialSelected.push(l.id);
      }
    });

    setSelectedListIds(initialSelected);
    setIsCreating(false);
    setNewListName('');
    setSelectedFolderId(DEFAULT_FOLDER_ID);
    setIsFolderDropdownOpen(false);
    setSearchQuery('');
    setFilterFolderId(null);
  }, [isOpen, item]);

  if (!isOpen) return null;

  const toggleList = (listId: string) => {
    triggerHaptic();
    setSelectedListIds((prev) =>
      prev.includes(listId) ? prev.filter((id) => id !== listId) : [...prev, listId]
    );
  };

  const handleCreateNewList = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    triggerHaptic();
    const targetFolder = selectedFolderId || DEFAULT_FOLDER_ID;
    const created = createList(newListName.trim(), targetFolder);
    const updatedLists = getLists();
    setUserLists(updatedLists);
    setSelectedListIds((prev) => [...prev, created.id]);

    // If folder filter is active and doesn't match the new list's folder, update filter so new list is visible
    if (filterFolderId !== null && filterFolderId !== targetFolder) {
      setFilterFolderId(targetFolder);
    }

    setNewListName('');
    setSelectedFolderId(DEFAULT_FOLDER_ID);
    setIsFolderDropdownOpen(false);
    setIsCreating(false);

    // Scroll to top so the new list (shown at top of custom lists) is immediately visible
    setTimeout(() => {
      if (listContainerRef.current) {
        listContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 50);
  };

  const handleSave = () => {
    triggerHaptic();

    // 1. Sync Favorites
    const isFavSelected = selectedListIds.includes(FAVORITES_ID);
    const favs = getFavoriteIds();
    if (isFavSelected && !favs.includes(item.id)) {
      setFavoriteIds([...favs, item.id]);
    } else if (!isFavSelected && favs.includes(item.id)) {
      setFavoriteIds(favs.filter((id) => id !== item.id));
    }

    // 2. Sync Custom Lists
    const currentLists = getLists();
    const updatedLists = currentLists.map((l) => {
      if (l.isDefault) return l;
      const shouldBeInList = selectedListIds.includes(l.id);
      const isCurrentlyInList = l.itemIds.includes(item.id);

      if (shouldBeInList && !isCurrentlyInList) {
        return { ...l, itemIds: [...l.itemIds, item.id] };
      }
      if (!shouldBeInList && isCurrentlyInList) {
        return { ...l, itemIds: l.itemIds.filter((id) => id !== item.id) };
      }
      return l;
    });

    saveLists(updatedLists);

    if (onSave) onSave();
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-xs bg-cardDark border-t sm:border border-cardBorder rounded-t-3xl sm:rounded-3xl p-5 space-y-4 animate-slide-up pb-8 sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-cardBorder pb-3">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <FolderPlus className="w-5 h-5 text-amber-400" />
            <span>{trans.details.add_to_list || trans.details.to_list_btn}</span>
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-full transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lists Search Bar */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="w-4 h-4 text-gray-500" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={trans.lists.search_lists_placeholder || 'Поиск списков...'}
            className="w-full bg-bgDark border border-cardBorder rounded-xl pl-9 pr-9 py-2 text-xs text-white focus:outline-none focus:border-accentViolet transition-colors placeholder:text-gray-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                triggerHaptic();
              }}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-white transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Folder Filter Chips */}
        {folders.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto hide-scrollbar pb-0.5 -mx-1 px-1">
            <button
              type="button"
              onClick={() => { setFilterFolderId(null); triggerHaptic(); }}
              className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition select-none ${
                filterFolderId === null
                  ? 'bg-accentViolet text-white shadow-sm'
                  : 'bg-white/5 border border-cardBorder text-gray-400 hover:text-white hover:border-gray-500'
              }`}
            >
              Все
            </button>
            {folders.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => { setFilterFolderId(f.id === filterFolderId ? null : f.id); triggerHaptic(); }}
                className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition select-none ${
                  filterFolderId === f.id
                    ? 'bg-accentViolet text-white shadow-sm'
                    : 'bg-white/5 border border-cardBorder text-gray-400 hover:text-white hover:border-gray-500'
                }`}
              >
                <span className="text-xs leading-none">{f.icon || '📁'}</span>
                <span className="truncate max-w-[80px]">{f.name}</span>
              </button>
            ))}
          </div>
        )}

        <div ref={listContainerRef} className="max-h-[50vh] overflow-y-auto space-y-2 hide-scrollbar">
          {/* Favorites List Item */}
          {(() => {
            const favTitle = trans.lists.favorites || 'Избранное';
            const isFavMatch = !searchQuery.trim() || favTitle.toLowerCase().includes(searchQuery.trim().toLowerCase());
            if (!isFavMatch) return null;

            const isFavSelected = selectedListIds.includes(FAVORITES_ID);
            return (
              <div
                key={FAVORITES_ID}
                onClick={() => toggleList(FAVORITES_ID)}
                className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition select-none ${
                  isFavSelected
                    ? 'bg-amber-500/10 border-amber-500/50'
                    : 'bg-bgDark border-cardBorder hover:border-gray-600'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Star
                    className={`w-4 h-4 ${
                      isFavSelected ? 'text-amber-400 fill-amber-400' : 'text-gray-400'
                    }`}
                  />
                  <span className="text-sm font-bold text-white">
                    {trans.lists.favorites}
                  </span>
                </div>
                <div
                  className={`w-5 h-5 rounded-md flex items-center justify-center transition border ${
                    isFavSelected
                      ? 'bg-amber-500 border-amber-500 text-black font-bold'
                      : 'border-cardBorder bg-bgDark text-transparent'
                  }`}
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
              </div>
            );
          })()}

          {/* Custom Lists */}
          {userLists
            .filter((l) => !l.isDefault)
            .filter((l) => !searchQuery.trim() || l.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
            .filter((l) => filterFolderId === null || (l.folderId || DEFAULT_FOLDER_ID) === filterFolderId)
            .map((list) => {
              const isSelected = selectedListIds.includes(list.id);
              const folderName = folders.find((f) => f.id === (list.folderId || DEFAULT_FOLDER_ID))?.name || 'Разное';
              return (
                <div
                  key={list.id}
                  onClick={() => toggleList(list.id)}
                  className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition select-none ${
                    isSelected
                      ? 'bg-accentViolet/20 border-accentViolet'
                      : 'bg-bgDark border-cardBorder hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center min-w-0 pr-2">
                    <span className="text-sm font-bold text-white truncate max-w-[170px]">
                      {list.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-gray-300 font-semibold max-w-[100px] truncate">
                      {folderName}
                    </span>
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center transition border ${
                        isSelected
                          ? 'bg-accentViolet border-accentViolet text-white'
                          : 'border-cardBorder bg-bgDark text-transparent'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  </div>
                </div>
              );
            })}

          {/* Empty state when searching */}
          {(() => {
            const favTitle = trans.lists.favorites || 'Избранное';
            const isFavMatch = !searchQuery.trim() || favTitle.toLowerCase().includes(searchQuery.trim().toLowerCase());
            const matchedLists = userLists.filter((l) => !l.isDefault && (!searchQuery.trim() || l.name.toLowerCase().includes(searchQuery.trim().toLowerCase())));
            if (searchQuery.trim() && !isFavMatch && matchedLists.length === 0) {
              return (
                <div className="py-4 text-center text-xs text-gray-400">
                  {trans.lists.empty_list || 'Ничего не найдено'}
                </div>
              );
            }
            return null;
          })()}
        </div>

        {/* Create New List Inline */}
        {isCreating ? (
          <form onSubmit={handleCreateNewList} className="space-y-2 pt-1 animate-fade-in">
            <input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder={trans.lists.create_name_placeholder}
              autoFocus
              className="w-full bg-bgDark border border-cardBorder rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-accentViolet"
            />

            {/* Folder Dropdown Selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic();
                  setIsFolderDropdownOpen(!isFolderDropdownOpen);
                }}
                className="w-full bg-bgDark border border-cardBorder rounded-xl px-3 py-2 text-xs text-white flex items-center justify-between hover:border-gray-500 transition select-none"
              >
                <span className="flex items-center gap-2 truncate font-medium text-white">
                  <span className="text-gray-400 text-[10px] uppercase font-bold tracking-wider">
                    {trans.lists.folder_label || 'Папка'}:
                  </span>
                  <span className="text-sm">{folders.find((f) => f.id === selectedFolderId)?.icon || '📁'}</span>
                  <span className="truncate font-bold">{folders.find((f) => f.id === selectedFolderId)?.name || 'Разное'}</span>
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 shrink-0 ${isFolderDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isFolderDropdownOpen && (
                <div className="absolute left-0 right-0 bottom-full mb-1 z-50 bg-cardDark border-2 border-accentViolet/50 rounded-xl shadow-2xl p-1.5 max-h-40 overflow-y-auto space-y-1 animate-fade-in hide-scrollbar">
                  {folders.map((f) => {
                    const isSelected = selectedFolderId === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => {
                          triggerHaptic();
                          setSelectedFolderId(f.id);
                          setIsFolderDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-2 rounded-xl text-xs flex items-center justify-between transition select-none ${
                          isSelected
                            ? 'bg-accentViolet text-white font-bold shadow-sm'
                            : 'bg-bgDark text-white hover:bg-accentViolet/20 border border-cardBorder/50'
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span className="text-sm">{f.icon || '📁'}</span>
                          <span className="truncate font-semibold">{f.name}</span>
                        </span>
                        {isSelected && <Check className="w-4 h-4 stroke-[3] shrink-0 text-white" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setIsFolderDropdownOpen(false);
                }}
                className="flex-1 py-2 rounded-xl bg-bgDark border border-cardBorder text-gray-300 font-semibold text-xs hover:border-gray-500 transition"
              >
                {trans.lists.cancel_btn}
              </button>
              <button
                type="submit"
                className="flex-1 py-2 rounded-xl bg-accentViolet text-white font-bold text-xs hover:opacity-90 transition"
              >
                {trans.lists.create_btn}
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => {
              triggerHaptic();
              setIsCreating(true);
            }}
            className="w-full py-2.5 rounded-xl border border-dashed border-cardBorder text-gray-400 hover:text-white hover:border-accentViolet transition text-xs font-semibold flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4 text-accentViolet" />
            <span>{trans.lists.new_list}</span>
          </button>
        )}

        {/* Save button */}
        <button
          onClick={handleSave}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-accentViolet to-accentTeal text-white font-bold text-sm shadow-lg hover:opacity-90 active:scale-[0.97] transition mt-2"
        >
          {trans.modal.save}
        </button>
      </div>
    </div>,
    document.body
  );
};
