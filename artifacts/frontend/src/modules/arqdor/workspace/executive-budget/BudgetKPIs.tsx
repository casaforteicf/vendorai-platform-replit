import React from "react";
import { useBudget } from "./BudgetContext";
import { formatCurrency } from "./budgetData";
import { useBudgetEngine } from "./useBudgetEngine";

function KPI({ label, value, description }: { label: string; value: string; description?: string }) {
  return (
    <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
      {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
    </div>
  );
}

export function BudgetKPIs() {
  const { items, discipline } = useBudget();
  const engine = useBudgetEngine(items, discipline);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <KPI label="Total" value={formatCurrency(engine.total)} description="Com margem aplicada" />
      <KPI label="Subtotal" value={formatCurrency(engine.subtotal)} description="Custo direto estimado" />
      <KPI label="Margem" value={formatCurrency(engine.margin)} description="Resultado previsto" />
      <KPI label="Pendências" value={String(engine.pending)} description="Itens a revisar" />
    </div>
  );
}
