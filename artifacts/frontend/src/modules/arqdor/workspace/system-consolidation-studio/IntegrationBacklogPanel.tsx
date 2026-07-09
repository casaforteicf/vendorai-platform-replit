import React from "react";
import { integrationTasks } from "./consolidationData";
import { effortClass, priorityClass, statusClass, statusLabel } from "./consolidationUtils";

export function IntegrationBacklogPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Integração real</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Backlog de conexão entre módulos</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        {integrationTasks.map((task) => (
          <article key={task.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(task.status)}`}>
                {statusLabel(task.status)}
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityClass(task.priority)}`}>
                {task.priority}
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${effortClass(task.effort)}`}>
                {task.effort}
              </span>
            </div>

            <p className="mt-4 text-base font-semibold text-slate-950">{task.title}</p>
            <p className="mt-1 text-sm text-slate-500">{task.from} → {task.to}</p>
            <p className="mt-4 text-sm leading-6 text-slate-600">{task.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
