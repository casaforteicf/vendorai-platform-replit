import React, { useMemo, useState } from "react";
import { SearchLibrary } from "./SearchLibrary";

export type MaterialItem = {
  id: string;
  name: string;
  category: string;
  finish?: string;
  brand?: string;
};

const defaultMaterials: MaterialItem[] = [
  { id: "m01", name: "MDF Freijó Natural", category: "Marcenaria", finish: "Madeirado", brand: "Genérico" },
  { id: "m02", name: "Quartzo Branco", category: "Pedras", finish: "Polido", brand: "Genérico" },
  { id: "m03", name: "Porcelanato 90x90 Claro", category: "Revestimento", finish: "Acetinado", brand: "Genérico" },
  { id: "m04", name: "Metal Dourado Escovado", category: "Metais", finish: "Escovado", brand: "Genérico" },
  { id: "m05", name: "Linho Bege", category: "Tecidos", finish: "Natural", brand: "Genérico" },
];

type MaterialSidebarProps = {
  materials?: MaterialItem[];
  onSelect?: (material: MaterialItem) => void;
};

export function MaterialSidebar({ materials = defaultMaterials, onSelect }: MaterialSidebarProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return materials;

    return materials.filter((item) => {
      return (
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.brand?.toLowerCase().includes(q) ||
        item.finish?.toLowerCase().includes(q)
      );
    });
  }, [materials, query]);

  return (
    <div className="flex h-full flex-col bg-white p-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Biblioteca</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">Materiais</h3>
        <p className="mt-1 text-xs text-slate-500">
          Selecione um material para aplicar no objeto ou ambiente.
        </p>
      </div>

      <div className="mt-5">
        <SearchLibrary value={query} onChange={setQuery} placeholder="Buscar material..." />
      </div>

      <div className="mt-5 min-h-0 flex-1 space-y-3 overflow-y-auto">
        {filtered.map((material) => (
          <button
            key={material.id}
            type="button"
            onClick={() => onSelect?.(material)}
            className="w-full rounded-3xl border border-slate-100 bg-slate-50 p-4 text-left transition hover:border-violet-200 hover:bg-violet-50"
          >
            <p className="text-sm font-semibold text-slate-900">{material.name}</p>
            <p className="mt-1 text-xs text-slate-500">
              {material.category}
              {material.finish ? ` • ${material.finish}` : ""}
            </p>
            {material.brand ? (
              <p className="mt-2 inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500">
                {material.brand}
              </p>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
