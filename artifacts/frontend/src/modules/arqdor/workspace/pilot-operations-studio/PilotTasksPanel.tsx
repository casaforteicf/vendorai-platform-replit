import React from "react";
import { pilotTasks } from "./pilotData";
import { pilotStatusClass, pilotStatusLabel, priorityClass } from "./pilotUtils";

export function PilotTasksPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Tarefas</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Execução diária dos pilotos</h2>

      <div className="mt-5 space-y-3">
        {pilotTasks.map((task) => (
          <article key={task.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-base font-semibold text-slate-950">{task.title}</p>
                <p className="mt-1 text-sm text-slate-500">{task.account} • {task.owner} • {task.due}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityClass(task.priority)}`}>{task.priority}</span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${pilotStatusClass(task.status)}`}>
                  {pilotStatusLabel(task.status)}
                </span>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">{task.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
