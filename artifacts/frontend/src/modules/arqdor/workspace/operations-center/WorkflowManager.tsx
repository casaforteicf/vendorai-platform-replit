import React from "react";
import { workflows } from "./operationsData";
import { workflowClass } from "./operationsUtils";

export function WorkflowManager() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Workflow Manager</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Automações operacionais</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {workflows.map((workflow) => (
          <article key={workflow.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{workflow.title}</p>
                <p className="mt-1 text-sm text-slate-500">{workflow.trigger}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${workflowClass(workflow.status)}`}>{workflow.status}</span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Info label="Ação" value={workflow.action} />
              <Info label="Execuções" value={String(workflow.runs)} />
              <Info label="Sucesso" value={`${workflow.successRate}%`} />
              <Info label="Módulos" value={workflow.modules.join(", ")} />
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
