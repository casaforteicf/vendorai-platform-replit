import React from "react";
import { copilotAgents } from "./copilotData";
import { statusClass } from "./copilotUtils";

export function AgentOrchestrator() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Agent Orchestrator</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Agentes especializados</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {copilotAgents.map((agent) => (
          <article key={agent.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{agent.name}</p>
                <p className="mt-1 text-sm text-slate-500">{agent.module}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(agent.status)}`}>{agent.status}</span>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600">{agent.role}</p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Info label="Confiança" value={`${agent.confidence}%`} />
              <Info label="Tarefas" value={String(agent.activeTasks)} />
            </div>
          </article>
        ))}
      </div>
    </section>
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
