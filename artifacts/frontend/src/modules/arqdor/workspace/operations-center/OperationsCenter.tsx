import React, { useState } from "react";
import { ActivityFeed } from "./ActivityFeed";
import { AICommandCenter } from "./AICommandCenter";
import { NotificationCenter } from "./NotificationCenter";
import { OperationsDashboard } from "./OperationsDashboard";
import { SystemHealth } from "./SystemHealth";
import { TaskCenter } from "./TaskCenter";
import { TaskInspector } from "./TaskInspector";
import { WorkflowManager } from "./WorkflowManager";
import { operationTasks } from "./operationsData";
import type { OperationTask, OperationsView } from "./operationsTypes";

type OperationsCenterProps = {
  arqState?: any;
  onNavigate?: (module: string) => void;
};

function Header({ view, setView, onNavigate }: { view: OperationsView; setView: (view: OperationsView) => void; onNavigate?: (module: string) => void }) {
  const views: Array<{ id: OperationsView; label: string }> = [
    { id: "dashboard", label: "Dashboard" },
    { id: "tasks", label: "Tarefas" },
    { id: "workflows", label: "Workflows" },
    { id: "notifications", label: "Notificações" },
    { id: "activity", label: "Atividades" },
    { id: "health", label: "Health" },
    { id: "ai", label: "IA" },
  ];

  return (
    <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">AI Operations & Command Center</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Centro Operacional ARQDOR</h1>
          <p className="mt-1 text-sm text-slate-500">Tarefas, workflows, notificações, atividades, saúde do sistema e comando da IA.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {views.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={[
                "rounded-2xl px-4 py-2 text-sm font-semibold transition",
                view === item.id ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-700",
              ].join(" ")}
            >
              {item.label}
            </button>
          ))}

          <button type="button" onClick={() => onNavigate?.("dashboard")} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700">
            Home
          </button>
        </div>
      </div>
    </header>
  );
}

function Content({
  view,
  selectedTask,
  setSelectedTask,
}: {
  view: OperationsView;
  selectedTask: OperationTask;
  setSelectedTask: (task: OperationTask) => void;
}) {
  if (view === "tasks") {
    return (
      <div className="grid gap-5 xl:grid-cols-[1fr_390px]">
        <TaskCenter selectedTask={selectedTask} setSelectedTask={setSelectedTask} />
        <TaskInspector task={selectedTask} />
      </div>
    );
  }

  if (view === "workflows") return <WorkflowManager />;
  if (view === "notifications") return <NotificationCenter />;
  if (view === "activity") return <ActivityFeed />;
  if (view === "health") return <SystemHealth />;
  if (view === "ai") return <AICommandCenter />;

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_390px]">
      <OperationsDashboard selectedTask={selectedTask} setSelectedTask={setSelectedTask} />
      <div className="space-y-5">
        <TaskInspector task={selectedTask} />
        <AICommandCenter />
      </div>
    </div>
  );
}

export default function OperationsCenter({ onNavigate }: OperationsCenterProps) {
  const [view, setView] = useState<OperationsView>("dashboard");
  const [selectedTask, setSelectedTask] = useState<OperationTask>(operationTasks[0]);

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <Header view={view} setView={setView} onNavigate={onNavigate} />
        <Content view={view} selectedTask={selectedTask} setSelectedTask={setSelectedTask} />
      </div>
    </div>
  );
}
