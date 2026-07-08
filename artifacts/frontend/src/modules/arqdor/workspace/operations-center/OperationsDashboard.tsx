import React from "react";
import { MetricCard } from "./MetricCard";
import { TaskCard } from "./TaskCard";
import { operationTasks, workflows } from "./operationsData";
import type { OperationTask } from "./operationsTypes";

export function OperationsDashboard({ selectedTask, setSelectedTask }: { selectedTask: OperationTask; setSelectedTask: (task: OperationTask) => void }) {
  const blocked = operationTasks.filter((task) => task.status === "blocked").length;
  const critical = operationTasks.filter((task) => task.priority === "critical").length;
  const activeWorkflows = workflows.filter((workflow) => workflow.status === "active").length;

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Tarefas" value={String(operationTasks.length)} description="Tarefas operacionais abertas." />
        <MetricCard label="Críticas" value={String(critical)} description="Tarefas de prioridade máxima." />
        <MetricCard label="Bloqueadas" value={String(blocked)} description="Itens impedindo avanço." />
        <MetricCard label="Workflows" value={String(activeWorkflows)} description="Automações ativas." />
      </section>

      <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Centro operacional</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">Tarefas prioritárias</h2>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {operationTasks.map((task) => (
            <TaskCard key={task.id} task={task} selected={selectedTask.id === task.id} onSelect={setSelectedTask} />
          ))}
        </div>
      </section>
    </div>
  );
}
