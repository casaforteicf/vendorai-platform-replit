import React from "react";
import { aiAgents } from "./aiEnterpriseData";
import type { AIAgent } from "./aiEnterpriseTypes";
import { statusClass, statusLabel } from "./aiEnterpriseUtils";

function AgentCard({ agent }: { agent: AIAgent }) {
  return (
    <article className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-slate-950">{agent.name}</p>
          <p className="mt-1 text-sm text-slate-500">{agent.module}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(agent.status)}`}>
          {statusLabel(agent.status)}
        </span>
      </div>

      <p className="mt-4 min-h-[68px] text-sm leading-6 text-slate-600">{agent.role}</p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="text-xs text-slate-400">Autonomia</p>
          <p className="mt-1 font-semibold text-slate-800">{agent.autonomy}%</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="text-xs text-slate-400">Confiança</p>
          <p className="mt-1 font-semibold text-slate-800">{agent.confidence}%</p>
        </div>
      </div>

      <div className="mt-4 rounded-3xl bg-violet-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Foco atual</p>
        <p className="mt-1 text-sm leading-5 text-violet-900">{agent.currentFocus}</p>
      </div>
    </article>
  );
}

export function AIAgentGrid() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">AI Agents</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-950">Camada de agentes especializados</h2>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {aiAgents.map((agent) => (
          <AgentCard key={agent.key} agent={agent} />
        ))}
      </div>
    </section>
  );
}
