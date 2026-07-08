import React from "react";
import { agents, decisions, memories, playbooks } from "./aiCommandData";
import { MetricCard } from "./MetricCard";

export function AICommandReports() {
  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Agentes" value={String(agents.length)} description="Agentes IA configurados." />
        <MetricCard label="Decisões" value={String(decisions.length)} description="Decisões recomendadas." />
        <MetricCard label="Playbooks" value={String(playbooks.length)} description="Fluxos inteligentes." />
        <MetricCard label="Memórias" value={String(memories.length)} description="Regras e aprendizados." />
      </section>

      <section className="rounded-[34px] border border-slate-100 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Relatório IA</p>
        <h2 className="mt-2 text-3xl font-semibold text-slate-950">AI Command Summary</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
          Relatório consolidado dos agentes, decisões, prompts, playbooks, memória e bases de treinamento.
        </p>

        <button type="button" className="mt-6 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-700">
          Gerar relatório PDF
        </button>
      </section>
    </div>
  );
}
