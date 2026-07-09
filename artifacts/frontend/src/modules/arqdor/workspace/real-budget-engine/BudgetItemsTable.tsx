import React from "react";
import type { BudgetItem, BudgetViewMode } from "./budgetTypes";
import { money } from "./budgetUtils";

export function BudgetItemsTable({
  items,
  selectedItem,
  viewMode,
  onSelect,
  onDelete,
}: {
  items: BudgetItem[];
  selectedItem?: BudgetItem | null;
  viewMode: BudgetViewMode;
  onSelect: (item: BudgetItem) => void;
  onDelete: (id: string) => void;
}) {
  const visibleItems = viewMode === "client" ? items.filter((item) => item.visibleToClient) : items;

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Itens</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-950">Tabela correta para orçamento e impressão</h2>
      </div>

      <div className="mt-5 overflow-x-auto rounded-3xl border border-slate-100">
        <table className="min-w-[1100px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Qtd.</th>
              <th className="px-4 py-3">Un.</th>
              <th className="px-4 py-3">Valor Material</th>
              <th className="px-4 py-3">Valor Mão de Obra</th>
              <th className="px-4 py-3">Total Material</th>
              <th className="px-4 py-3">Total Mão de Obra</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Fornecedor</th>
              <th className="px-4 py-3">Ações</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {visibleItems.map((item) => (
              <tr
                key={item.id}
                className={selectedItem?.id === item.id ? "bg-violet-50" : "bg-white"}
              >
                <td className="px-4 py-4">
                  <button type="button" onClick={() => onSelect(item)} className="text-left">
                    <p className="font-medium text-slate-800">{item.item}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.description || item.productName || item.materialName || "-"}</p>
                  </button>
                </td>
                <td className="px-4 py-4 text-slate-500">{item.quantity}</td>
                <td className="px-4 py-4 text-slate-500">{item.unit}</td>
                <td className="px-4 py-4 text-slate-500">{money(item.materialValue)}</td>
                <td className="px-4 py-4 text-slate-500">{money(item.laborValue)}</td>
                <td className="px-4 py-4 text-slate-500">{money(item.totalMaterial)}</td>
                <td className="px-4 py-4 text-slate-500">{money(item.totalLabor)}</td>
                <td className="px-4 py-4 font-semibold text-slate-950">{money(item.total)}</td>
                <td className="px-4 py-4 text-slate-500">{item.supplierName || item.manufacturerName || "-"}</td>
                <td className="px-4 py-4">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onSelect(item)}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"
                    >
                      editar
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(item.id)}
                      className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700"
                    >
                      excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {!visibleItems.length ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-sm text-slate-500">
                  Nenhum item no orçamento. Gere a partir dos SpecObjects ou adicione manualmente.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
