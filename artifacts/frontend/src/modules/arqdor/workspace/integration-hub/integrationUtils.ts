import type { HandoffStatus, ModuleStatus, WorkflowStatus } from "./integrationTypes";

export function moduleStatusClass(status: ModuleStatus) {
  const classes: Record<ModuleStatus, string> = {
    connected: "bg-emerald-50 text-emerald-700",
    partial: "bg-blue-50 text-blue-700",
    mock: "bg-amber-50 text-amber-700",
    error: "bg-rose-50 text-rose-700",
    disabled: "bg-slate-100 text-slate-700",
  };
  return classes[status];
}

export function workflowStatusClass(status: WorkflowStatus | HandoffStatus) {
  const classes: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700",
    paused: "bg-amber-50 text-amber-700",
    draft: "bg-slate-100 text-slate-700",
    error: "bg-rose-50 text-rose-700",
    ready: "bg-blue-50 text-blue-700",
    waiting: "bg-amber-50 text-amber-700",
    blocked: "bg-rose-50 text-rose-700",
    completed: "bg-emerald-50 text-emerald-700",
  };
  return classes[status] || "bg-slate-100 text-slate-700";
}

export function dataSourceLabel(source: "real_api" | "mock" | "hybrid") {
  const labels = {
    real_api: "API real",
    mock: "Mock",
    hybrid: "Híbrido",
  } as const;
  return labels[source];
}

export function eventClass(type: "sync" | "handoff" | "approval" | "error" | "automation") {
  const classes = {
    sync: "bg-blue-50 text-blue-700",
    handoff: "bg-violet-50 text-violet-700",
    approval: "bg-emerald-50 text-emerald-700",
    error: "bg-rose-50 text-rose-700",
    automation: "bg-amber-50 text-amber-700",
  } as const;
  return classes[type];
}
