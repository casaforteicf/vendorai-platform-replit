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
    <section className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Itens</p>
        <h2 className="mt-1 text-xl font-semibold text-[var(--arq-foreground)]">Tabela correta para orçamento e impressão</h2>
      </div>

      <div className="mt-5 overflow-x-auto rounded-3xl border border-[var(--arq-border)]">
        <table className="min-w-[1100px] w-full text-left text-sm">
          <thead className="bg-[var(--arq-card-soft)] text-xs uppercase tracking-wide text-[var(--arq-muted)]">
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

          <tbody className="divide-y divide-[var(--arq-border)]">
            {visibleItems.map((item) => (
              <tr
                key={item.id}
                className={selectedItem?.id === item.id ? "bg-[var(--arq-card-soft)]" : "bg-[var(--arq-card)]"}
              >
                <td className="px-4 py-4">
                  <button type="button" onClick={() => onSelect(item)} className="text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-[var(--arq-foreground)]">{item.item}</p>
                      {item.specificationOutdated ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Revisar especificação</span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-[var(--arq-muted)]">{item.description || item.productName || item.materialName || "-"}</p>
                    {item.specificationOutdated ? (
                      <p className="mt-1 text-[11px] font-medium text-amber-700">
                        {item.specificationImpact === "removed" ? "Item removido do projeto." : item.specificationImpact === "quantity_changed" ? "Quantidade alterada no projeto." : "Geometria alterada no projeto."}
                        {item.specificationRevision ? ` Revisão ${item.specificationRevision}.` : ""}
                      </p>
                    ) : null}
                  </button>
                </td>
                <td className="px-4 py-4 text-[var(--arq-muted)]">{item.quantity}</td>
                <td className="px-4 py-4 text-[var(--arq-muted)]">{item.unit}</td>
                <td className="px-4 py-4 text-[var(--arq-muted)]">{money(item.materialValue)}</td>
                <td className="px-4 py-4 text-[var(--arq-muted)]">{money(item.laborValue)}</td>
                <td className="px-4 py-4 text-[var(--arq-muted)]">{money(item.totalMaterial)}</td>
                <td className="px-4 py-4 text-[var(--arq-muted)]">{money(item.totalLabor)}</td>
                <td className="px-4 py-4 font-semibold text-[var(--arq-foreground)]">{money(item.total)}</td>
                <td className="px-4 py-4 text-[var(--arq-muted)]">{item.supplierName || item.manufacturerName || "-"}</td>
                <td className="px-4 py-4">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onSelect(item)}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-[var(--arq-foreground)]"
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
                <td colSpan={10} className="px-4 py-12 text-center text-sm text-[var(--arq-muted)]">
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
