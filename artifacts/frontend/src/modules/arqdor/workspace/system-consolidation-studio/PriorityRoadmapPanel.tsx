import React from "react";
import { priorityTasks } from "./consolidationData";
import { effortClass, priorityClass } from "./consolidationUtils";

export function PriorityRoadmapPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Prioridades</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Próximas ações para deixar o ARQDOR operacional</h2>

      <div className="mt-5 grid gap-5 xl:grid-cols-5">
        {priorityTasks.map((task, index) => (
          <article key={task.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
                {index + 1}
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityClass(task.priority)}`}>
                  {task.priority}
                </span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${effortClass(task.effort)}`}>
                  {task.effort}
                </span>
              </div>
            </div>

            <p className="mt-4 text-base font-semibold text-slate-950">{task.title}</p>
            <p className="mt-1 text-sm text-slate-500">{task.owner}</p>

            <Block label="Por que" value={task.reason} />
            <Block label="Impacto" value={task.impact} highlight />
          </article>
        ))}
      </div>
    </section>
  );
}

function Block({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`mt-4 rounded-3xl p-4 ${highlight ? "bg-violet-50" : "bg-slate-50"}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${highlight ? "text-violet-600" : "text-slate-400"}`}>{label}</p>
      <p className={`mt-1 text-sm leading-6 ${highlight ? "text-violet-900" : "text-slate-700"}`}>{value}</p>
    </div>
  );
}
