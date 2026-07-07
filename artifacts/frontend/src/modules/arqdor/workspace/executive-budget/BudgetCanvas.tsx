import React from "react";
import { useBudget } from "./BudgetContext";
import { BudgetItemsTable } from "./BudgetItemsTable";
import { BudgetKPIs } from "./BudgetKPIs";
import { BudgetSummary } from "./BudgetSummary";
import { BudgetTimeline } from "./BudgetTimeline";
import { BudgetTotals } from "./BudgetTotals";

export function BudgetCanvas() {
  const { view } = useBudget();

  if (view === "itens") return <BudgetItemsTable />;
  if (view === "resumo") return <BudgetSummary />;
  if (view === "timeline") return <BudgetTimeline />;
  if (view === "proposta") {
    return (
      <div className="rounded-[28px] border border-slate-100 bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Proposta</p>
        <h3 className="mt-2 text-2xl font-semibold text-slate-950">Preparar proposta comercial</h3>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
          A geração de proposta será conectada ao módulo comercial da Vendor.ai nas próximas etapas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <BudgetKPIs />
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <BudgetTotals />
        <BudgetSummary />
      </div>
    </div>
  );
}
