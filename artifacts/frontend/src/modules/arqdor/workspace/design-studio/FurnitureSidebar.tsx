import React, { useMemo, useState } from "react";
import { SearchLibrary } from "./SearchLibrary";

export type FurnitureItem = {
  id: string;
  name: string;
  category: string;
  style?: string;
  brand?: string;
};

const defaultFurniture: FurnitureItem[] = [
  { id: "f01", name: "Banqueta Estofada", category: "Assentos", style: "Contemporâneo" },
  { id: "f02", name: "Mesa Jantar Madeira", category: "Mesa", style: "Natural" },
  { id: "f03", name: "Poltrona Curva", category: "Poltronas", style: "Orgânico" },
  { id: "f04", name: "Sofá Modular", category: "Sofás", style: "Minimalista" },
];

type FurnitureSidebarProps = {
  items?: FurnitureItem[];
  onSelect?: (item: FurnitureItem) => void;
};

export function FurnitureSidebar({ items = defaultFurniture, onSelect }: FurnitureSidebarProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;

    return items.filter((item) => {
      return (
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.style?.toLowerCase().includes(q) ||
        item.brand?.toLowerCase().includes(q)
      );
    });
  }, [items, query]);

  return (
    <div className="flex h-full flex-col bg-white p-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Biblioteca</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">Mobiliário</h3>
        <p className="mt-1 text-xs text-slate-500">
          Estrutura inicial para objetos, móveis e decoração.
        </p>
      </div>

      <div className="mt-5">
        <SearchLibrary value={query} onChange={setQuery} placeholder="Buscar mobiliário..." />
      </div>

      <div className="mt-5 min-h-0 flex-1 space-y-3 overflow-y-auto">
        {filtered.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect?.(item)}
            className="w-full rounded-3xl border border-slate-100 bg-slate-50 p-4 text-left transition hover:border-violet-200 hover:bg-violet-50"
          >
            <p className="text-sm font-semibold text-slate-900">{item.name}</p>
            <p className="mt-1 text-xs text-slate-500">
              {item.category}
              {item.style ? ` • ${item.style}` : ""}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
