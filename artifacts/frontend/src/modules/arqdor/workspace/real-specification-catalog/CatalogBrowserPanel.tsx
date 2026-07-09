import React from "react";
import type { CatalogItem, CatalogItemType, SpecObject } from "./specCatalogTypes";
import { money } from "./specCatalogUtils";

export function CatalogBrowserPanel({
  items,
  selectedObject,
  catalogType,
  query,
  loading,
  onTypeChange,
  onQueryChange,
  onApply,
  onReload,
}: {
  items: CatalogItem[];
  selectedObject?: SpecObject | null;
  catalogType: CatalogItemType | "all";
  query: string;
  loading?: boolean;
  onTypeChange: (value: CatalogItemType | "all") => void;
  onQueryChange: (value: string) => void;
  onApply: (item: CatalogItem) => void;
  onReload: () => void;
}) {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Catálogo real</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">Produtos, materiais, fabricantes e fornecedores</h2>
        </div>

        <button
          type="button"
          onClick={onReload}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700"
        >
          {loading ? "Carregando..." : "Atualizar catálogo"}
        </button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[220px_1fr]">
        <select
          value={catalogType}
          onChange={(event) => onTypeChange(event.target.value as CatalogItemType | "all")}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
        >
          <option value="all">Todos</option>
          <option value="product">Produtos</option>
          <option value="material">Materiais</option>
          <option value="manufacturer">Fabricantes</option>
          <option value="supplier">Fornecedores</option>
          <option value="component">Componentes</option>
          <option value="finish">Acabamentos</option>
        </select>

        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Buscar no catálogo..."
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
        />
      </div>

      {!loading && !items.length ? (
        <div className="mt-5 rounded-[28px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
          <p className="text-sm font-semibold text-slate-700">Nenhum item encontrado</p>
          <p className="mt-1 text-sm text-slate-500">Verifique se /arch/catalogo está retornando dados reais para o tenant.</p>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <article key={item.id} className="rounded-[26px] border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex gap-3">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
                {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" /> : null}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-950">{item.name}</p>
                <p className="mt-1 text-xs text-slate-500">{item.type} • {item.category || "sem categoria"}</p>
                <p className="mt-1 text-xs text-slate-500">{item.manufacturer || item.supplier || item.material || "sem vínculo"}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Info label="Material" value={money(item.price)} />
              <Info label="Mão de obra" value={money(item.laborPrice)} />
            </div>

            <button
              type="button"
              disabled={!selectedObject}
              onClick={() => onApply(item)}
              className="mt-4 w-full rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Aplicar ao objeto
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
