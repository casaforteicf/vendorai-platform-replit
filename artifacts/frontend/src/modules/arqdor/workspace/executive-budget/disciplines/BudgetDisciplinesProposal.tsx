import React, { useState } from "react";
import { BudgetDisciplinePanel } from "./BudgetDisciplinePanel";
import { BudgetReview } from "./BudgetReview";
import { ExportBudget } from "./ExportBudget";
import { ProposalGenerator } from "./ProposalGenerator";

type Tab = "disciplinas" | "proposta" | "exportar" | "revisao";

export default function BudgetDisciplinesProposal() {
  const [tab, setTab] = useState<Tab>("disciplinas");

  return (
    <div className="min-h-screen bg-[#f7f7f8] p-6 text-slate-950">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <header className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Sprint 007B</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Budget Disciplines + Proposal</h1>
          <p className="mt-1 text-sm text-slate-500">
            Orçamento por disciplina, revisão, geração de proposta e exportação.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            {[
              ["disciplinas", "Disciplinas"],
              ["proposta", "Proposta"],
              ["exportar", "Exportar"],
              ["revisao", "Revisão"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key as Tab)}
                className={[
                  "rounded-2xl px-4 py-2 text-sm font-semibold transition",
                  tab === key ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-700",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        {tab === "disciplinas" ? <BudgetDisciplinePanel /> : null}
        {tab === "proposta" ? <ProposalGenerator /> : null}
        {tab === "exportar" ? <ExportBudget /> : null}
        {tab === "revisao" ? <BudgetReview /> : null}
      </div>
    </div>
  );
}
