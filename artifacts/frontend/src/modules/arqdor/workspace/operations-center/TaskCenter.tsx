import React from "react";
import { TaskCard } from "./TaskCard";
import { operationTasks } from "./operationsData";
import type { OperationTask } from "./operationsTypes";

export function TaskCenter({ selectedTask, setSelectedTask }: { selectedTask: OperationTask; setSelectedTask: (task: OperationTask) => void }) {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Task Center</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Fila única de tarefas</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {operationTasks.map((task) => (
          <TaskCard key={task.id} task={task} selected={selectedTask.id === task.id} onSelect={setSelectedTask} />
        ))}
      </div>
    </section>
  );
}
