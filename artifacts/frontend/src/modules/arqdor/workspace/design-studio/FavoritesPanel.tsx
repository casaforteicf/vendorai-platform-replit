import React from "react";

export type FavoriteItem = {
  id: string;
  name: string;
  category: string;
};

type FavoritesPanelProps = {
  items: FavoriteItem[];
  onSelect?: (item: FavoriteItem) => void;
};

export function FavoritesPanel({ items, onSelect }: FavoritesPanelProps) {
  if (!items.length) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        Nenhum favorito ainda.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect?.(item)}
          className="w-full rounded-2xl border border-slate-100 bg-white p-3 text-left transition hover:border-violet-200 hover:bg-violet-50"
        >
          <p className="text-sm font-semibold text-slate-800">{item.name}</p>
          <p className="mt-1 text-xs text-slate-500">{item.category}</p>
        </button>
      ))}
    </div>
  );
}
