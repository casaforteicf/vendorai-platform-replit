import React from "react";
import { copilotActions, copilotAgents, contextItems, healthChecks } from "./copilotData";
import { MetricCard } from "./MetricCard";

export function CopilotReports() {
  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Agentes" value={String(copilotAgents.length)} description="Agentes orquestrados." />
        <MetricCard label="Contextos" value={String(contextItems.length)} description="Entidades no contexto." />
        <MetricCard label="Ações" value={String(copilotActions.length)} description="Ações recomendadas." />
        <MetricCard label="Health checks" value={String(healthChecks.length)} description="Serviços monitorados." />
      </section>

      <section className="rounded-[34px] border border-slate-100 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Relatório Copilot</p>
        <h2 className="mt-2 text-3xl font-semibold text-slate-950">Unified AI Copilot Summary</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
          Relatório do copiloto único, incluindo agentes, ações, contexto, saúde das integrações, playbooks e recomendações.
        </p>

        <button type="button" className="mt-6 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-700">
          Gerar relatório PDF
        </button>
      </section>
    </div>
  );
}
