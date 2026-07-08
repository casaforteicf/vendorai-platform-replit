import React from "react";
import { agents } from "./aiCommandData";
import { statusClass } from "./aiCommandUtils";

export function AIAgentMonitor() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">AI Agents</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Monitoramento dos agentes</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        {agents.map((agent) => (
          <article key={agent.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{agent.name}</p>
                <p className="mt-1 text-sm text-slate-500">{agent.module}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(agent.status)}`}>{agent.status}</span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Info label="Score" value={`${agent.score}%`} />
              <Info label="Tarefas" value={String(agent.tasks)} />
            </div>

            <p className="mt-4 text-xs leading-5 text-slate-500">{agent.lastAction}</p>
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
