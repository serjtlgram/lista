import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Plus, FolderPlus, Star } from 'lucide-react';
import { Item } from '../types';
import { Translations } from '../services/i18n';
import { getLists, saveLists, createList, FAVORITES_ID, UserList } from '../services/lists';
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
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newListName, setNewListName] = useState('');

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
    const created = createList(newListName.trim());
    const updatedLists = getLists();
    setUserLists(updatedLists);
    setSelectedListIds((prev) => [...prev, created.id]);
    setNewListName('');
    setIsCreating(false);
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

        <div className="max-h-[50vh] overflow-y-auto space-y-2 hide-scrollbar">
          {/* Favorites List Item */}
          {(() => {
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
            .map((list) => {
              const isSelected = selectedListIds.includes(list.id);
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
                  <span className="text-sm font-bold text-white truncate max-w-[180px]">
                    {list.name}
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
              );
            })}
        </div>

        {/* Create New List Inline */}
        {isCreating ? (
          <form onSubmit={handleCreateNewList} className="space-y-2 pt-1">
            <input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder={trans.lists.create_name_placeholder}
              autoFocus
              className="w-full bg-bgDark border border-cardBorder rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-accentViolet"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="flex-1 py-2 rounded-xl bg-cardBorder text-gray-300 font-semibold text-xs hover:text-white transition"
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
            onClick={() => setIsCreating(true)}
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
