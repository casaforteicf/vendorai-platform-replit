import React from "react";
import type { OperationTask } from "./operationsTypes";
import { formatDate, priorityClass, taskStatusClass } from "./operationsUtils";

export function TaskInspector({ task }: { task: OperationTask }) {
  return (
    <aside className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Tarefa selecionada</p>
      <h3 className="mt-1 text-lg font-semibold text-slate-950">{task.title}</h3>
      <p className="mt-1 text-sm text-slate-500">{task.module} • {task.owner}</p>

      <div className="mt-5 flex flex-wrap gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${taskStatusClass(task.status)}`}>{task.status}</span>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityClass(task.priority)}`}>{task.priority}</span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Info label="Módulo" value={task.module} />
        <Info label="Responsável" value={task.owner} />
        <Info label="Prazo" value={formatDate(task.dueDate)} />
        <Info label="Progresso" value={`${task.progress}%`} />
      </div>

      <div className="mt-5 rounded-3xl bg-violet-50 p-4">
        <p className="text-sm font-semibold text-violet-950">Leitura IA</p>
        <p className="mt-1 text-xs leading-5 text-violet-700">{task.aiNote}</p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        {["Iniciar", "Concluir", "Delegar", "Automatizar"].map((action, index) => (
          <button key={action} type="button" className={[
            "rounded-2xl px-3 py-3 text-xs font-semibold transition",
            index === 3 ? "bg-slate-950 text-white hover:bg-violet-700" : "bg-slate-50 text-slate-700 hover:bg-violet-50 hover:text-violet-700",
          ].join(" ")}>
            {action}
          </button>
        ))}
      </div>
    </aside>
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
