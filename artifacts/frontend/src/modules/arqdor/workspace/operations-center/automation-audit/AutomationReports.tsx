import React from "react";
import { automationRules, incidents } from "./automationAuditData";
import { MetricCard } from "./MetricCard";

export function AutomationReports() {
  const active = automationRules.filter((item) => item.status === "active").length;
  const successAvg = Math.round(automationRules.reduce((sum, item) => sum + item.successRate, 0) / automationRules.length);

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Automações" value={String(automationRules.length)} description="Regras cadastradas." />
        <MetricCard label="Ativas" value={String(active)} description="Regras operando." />
        <MetricCard label="Sucesso médio" value={`${successAvg}%`} description="Taxa média das execuções." />
        <MetricCard label="Incidentes" value={String(incidents.length)} description="Ocorrências registradas." />
      </section>

      <section className="rounded-[34px] border border-slate-100 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Relatório</p>
        <h2 className="mt-2 text-3xl font-semibold text-slate-950">Automation & Audit Summary</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
          Resumo executivo das automações, execuções, incidentes, permissões e trilha de auditoria.
        </p>

        <button type="button" className="mt-6 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-700">
          Gerar relatório PDF
        </button>
      </section>
    </div>
  );
}
