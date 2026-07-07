import React from "react";
import { budgetDisciplines, formatCurrency } from "./budgetData";
import { useBudget } from "./BudgetContext";
import { useBudgetEngine } from "./useBudgetEngine";

export function BudgetTotals() {
  const { items, discipline } = useBudget();
  const engine = useBudgetEngine(items, discipline);

  const rows = Object.entries(engine.byDiscipline)
    .map(([key, value]) => ({
      key,
      label: budgetDisciplines.find((item) => item.id === key)?.label || key,
      value,
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Totais</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">Por disciplina</h3>
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.key}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">{row.label}</span>
              <span className="text-slate-500">{formatCurrency(row.value)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-violet-600"
                style={{ width: `${engine.total ? Math.min(100, (row.value / engine.total) * 100) : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
