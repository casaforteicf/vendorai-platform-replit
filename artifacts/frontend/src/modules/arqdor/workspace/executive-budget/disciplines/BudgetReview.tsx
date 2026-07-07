import React from "react";
import { disciplineBudgets } from "./disciplineBudgetData";

export function BudgetReview() {
  const checks = [
    "Quantitativos conferidos",
    "Custos de material revisados",
    "Mão de obra revisada",
    "Margem aplicada",
    "Frete considerado",
    "Prazo validado",
  ];

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Revisão</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">Checklist antes da proposta</h3>

        <div className="mt-5 space-y-2">
          {checks.map((check) => (
            <label key={check} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" />
              {check}
            </label>
          ))}
        </div>
      </div>

      <aside className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-950">Disciplinas incluídas</p>
        <div className="mt-4 space-y-2">
          {disciplineBudgets.map((discipline) => (
            <div key={discipline.id} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
              {discipline.label}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
