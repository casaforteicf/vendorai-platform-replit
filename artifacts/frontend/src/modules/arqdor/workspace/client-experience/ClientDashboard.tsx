import React from "react";
import { approvals, clientProject, files, financialItems } from "./clientExperienceData";
import { MetricCard } from "./MetricCard";
import { currency } from "./clientExperienceUtils";

export function ClientDashboard() {
  const pendingApprovals = approvals.filter((item) => item.status === "pending" || item.status === "changes_requested").length;
  const pendingFinancial = financialItems.filter((item) => item.status === "pending" || item.status === "scheduled").reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Progresso" value={`${clientProject.progress}%`} description={clientProject.phase} />
        <MetricCard label="Aprovações" value={String(pendingApprovals)} description="Itens aguardando cliente." />
        <MetricCard label="Arquivos" value={String(files.length)} description="Materiais disponíveis no portal." />
        <MetricCard label="Financeiro" value={currency(pendingFinancial)} description="Valores pendentes/agendados." />
      </section>

      <section className="rounded-[34px] border border-slate-100 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Portal Cliente</p>
        <h2 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">{clientProject.title}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
          Próxima ação: <strong>{clientProject.nextAction}</strong>.
        </p>

        <div className="mt-8 h-3 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-violet-600" style={{ width: `${clientProject.progress}%` }} />
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          {["Render aprovado", "Especificação", "Orçamento", "Compras"].map((step, index) => (
            <div key={step} className={["rounded-3xl p-5", index < 2 ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-800"].join(" ")}>
              <p className="text-sm font-semibold">{step}</p>
              <p className={["mt-2 text-xs leading-5", index < 2 ? "text-slate-300" : "text-slate-500"].join(" ")}>
                Etapa conectada ao portal.
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
