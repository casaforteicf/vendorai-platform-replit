import React from "react";
import { useBudget } from "./BudgetContext";
import { calculateItemTotal, formatCurrency } from "./budgetData";
import { useBudgetEngine } from "./useBudgetEngine";

const statusLabel: Record<string, string> = {
  estimado: "Estimado",
  a_revisar: "A revisar",
  aprovado: "Aprovado",
  orcado: "Orçado",
};

export function BudgetItemsTable() {
  const { items, discipline } = useBudget();
  const { visibleItems } = useBudgetEngine(items, discipline);

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-100 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-3">Item</th>
            <th className="px-4 py-3">Un.</th>
            <th className="px-4 py-3">Qtd.</th>
            <th className="px-4 py-3">Custo</th>
            <th className="px-4 py-3">Margem</th>
            <th className="px-4 py-3">Total</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {visibleItems.map((item) => (
            <tr key={item.id}>
              <td className="px-4 py-4">
                <p className="font-medium text-slate-800">{item.title}</p>
                {item.description ? <p className="mt-1 text-xs text-slate-500">{item.description}</p> : null}
              </td>
              <td className="px-4 py-4 text-slate-500">{item.unit}</td>
              <td className="px-4 py-4 text-slate-500">{item.quantity}</td>
              <td className="px-4 py-4 text-slate-500">{formatCurrency(item.unitCost)}</td>
              <td className="px-4 py-4 text-slate-500">{item.marginPercent}%</td>
              <td className="px-4 py-4 font-semibold text-slate-800">{formatCurrency(calculateItemTotal(item))}</td>
              <td className="px-4 py-4 text-slate-500">{statusLabel[item.status] || item.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
