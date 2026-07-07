import React from "react";
import { useBudget } from "./BudgetContext";

type Props = { projectTitle?: string; onBackToProduction?: () => void };

export function BudgetHeader({ projectTitle = "Projeto", onBackToProduction }: Props) {
  const { view, setView } = useBudget();

  return (
    <header className="flex flex-col gap-4 border-b border-slate-100 bg-white px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Executive Budget</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Orçamento Executivo</h1>
        <p className="mt-1 text-sm text-slate-500">{projectTitle}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[
          ["dashboard", "Dashboard"],
          ["itens", "Itens"],
          ["resumo", "Resumo"],
          ["timeline", "Timeline"],
          ["proposta", "Proposta"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key as any)}
            className={[
              "rounded-2xl px-4 py-2 text-sm font-semibold transition",
              view === key ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-700",
            ].join(" ")}
          >
            {label}
          </button>
        ))}

        <button
          type="button"
          onClick={onBackToProduction}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700"
        >
          Produção
        </button>
      </div>
    </header>
  );
}
