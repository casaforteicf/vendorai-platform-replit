import React from "react";
import { useBudget } from "./BudgetContext";
import { formatCurrency } from "./budgetData";
import { useBudgetEngine } from "./useBudgetEngine";

export function BudgetSummary() {
  const { items, discipline } = useBudget();
  const engine = useBudgetEngine(items, discipline);

  return (
    <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Resumo executivo</p>
      <h3 className="mt-1 text-lg font-semibold text-slate-950">Leitura financeira</h3>

      <div className="mt-5 space-y-3 text-sm leading-6 text-slate-600">
        <p>
          O orçamento atual possui <strong>{engine.visibleItems.length}</strong> item(ns), com total previsto de{" "}
          <strong>{formatCurrency(engine.total)}</strong>.
        </p>
        <p>
          A margem estimada é de <strong>{formatCurrency(engine.margin)}</strong>, considerando custos diretos e percentuais informados.
        </p>
        <p>
          Existem <strong>{engine.pending}</strong> item(ns) pendente(s) de revisão antes da geração da proposta final.
        </p>
      </div>
    </div>
  );
}
