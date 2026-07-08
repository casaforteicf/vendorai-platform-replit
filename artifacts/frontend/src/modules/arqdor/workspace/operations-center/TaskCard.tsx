import React from "react";
import type { OperationTask } from "./operationsTypes";
import { formatDate, priorityClass, taskStatusClass } from "./operationsUtils";

export function TaskCard({ task, selected, onSelect }: { task: OperationTask; selected?: boolean; onSelect: (task: OperationTask) => void }) {
  return (
    <button type="button" onClick={() => onSelect(task)} className="text-left">
      <article className={[
        "rounded-[30px] border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        selected ? "border-violet-300 ring-4 ring-violet-100" : "border-slate-100",
      ].join(" ")}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-slate-950">{task.title}</p>
            <p className="mt-1 text-sm text-slate-500">{task.module} • {task.owner}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${taskStatusClass(task.status)}`}>{task.status}</span>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityClass(task.priority)}`}>{task.priority}</span>
          <span className="text-xs font-semibold text-slate-500">{formatDate(task.dueDate)}</span>
        </div>

        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs">
            <span className="font-medium text-slate-600">Progresso</span>
            <span className="text-slate-400">{task.progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-violet-600" style={{ width: `${task.progress}%` }} />
          </div>
        </div>
      </article>
    </button>
  );
}
