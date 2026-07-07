import React from "react";
import { useDocumentationStudio } from "./DocumentationStudioContext";
import type { DocumentationItem } from "./documentationData";

export function PrintSelector({ items }: { items: DocumentationItem[] }) {
  const { selectedItems, toggleSelectedItem, clearSelection } = useDocumentationStudio();

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <div className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-5">
          <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Impressão</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">Selecionar documentos</h3>
          <p className="mt-1 text-sm text-slate-500">Imprima cadernos individuais ou um conjunto selecionado.</p>
        </div>

        <div className="space-y-2">
          {items.map((item) => (
            <label key={item.id} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={selectedItems.includes(item.id)}
                onChange={() => toggleSelectedItem(item.id)}
                className="h-4 w-4 rounded border-slate-300"
              />
              {item.title}
            </label>
          ))}
        </div>
      </div>

      <aside className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-950">Resumo</p>
        <p className="mt-2 text-sm text-slate-500">{selectedItems.length} item(ns) selecionado(s).</p>

        <button
          type="button"
          className="mt-5 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700"
        >
          Gerar PDF
        </button>

        <button
          type="button"
          onClick={clearSelection}
          className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700"
        >
          Limpar seleção
        </button>
      </aside>
    </div>
  );
}
