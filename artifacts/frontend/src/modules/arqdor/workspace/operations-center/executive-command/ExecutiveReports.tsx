import React from "react";
import { portfolioProjects, risks } from "./executiveData";
import { currency } from "./executiveUtils";

export function ExecutiveReports() {
  const totalBudget = portfolioProjects.reduce((sum, project) => sum + project.budget, 0);

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <section className="rounded-[34px] border border-slate-100 bg-white p-8 shadow-sm">
        <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Relatório executivo</p>
          <h2 className="mt-2 text-3xl font-semibold text-slate-950">Executive Command Summary</h2>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Relatório consolidado de portfólio, riscos, capacidade, previsões, margem e recomendações estratégicas.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-4">
            <Info label="Projetos" value={String(portfolioProjects.length)} />
            <Info label="Budget" value={currency(totalBudget)} />
            <Info label="Riscos" value={String(risks.length)} />
            <Info label="Status" value="Operacional" />
          </div>
        </div>
      </section>

      <aside className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-950">Saídas</p>
        <div className="mt-5 space-y-3">
          {["Gerar PDF", "Enviar diretoria", "Criar reunião", "Anexar ao projeto"].map((action) => (
            <button key={action} type="button" className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-violet-50 hover:text-violet-700">
              {action}
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-800">{value}</p>
    </div>
  );
}
