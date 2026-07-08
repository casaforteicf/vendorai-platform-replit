import type { TaskPriority, TaskStatus, WorkflowStatus } from "./operationsTypes";

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function taskStatusClass(status: TaskStatus) {
  const classes: Record<TaskStatus, string> = {
    pending: "bg-amber-50 text-amber-700",
    in_progress: "bg-violet-50 text-violet-700",
    blocked: "bg-rose-50 text-rose-700",
    done: "bg-emerald-50 text-emerald-700",
    cancelled: "bg-slate-100 text-slate-700",
  };
  return classes[status];
}

export function priorityClass(priority: TaskPriority) {
  const classes: Record<TaskPriority, string> = {
    low: "bg-slate-100 text-slate-700",
    medium: "bg-blue-50 text-blue-700",
    high: "bg-amber-50 text-amber-700",
    critical: "bg-rose-50 text-rose-700",
  };
  return classes[priority];
}

export function workflowClass(status: WorkflowStatus) {
  const classes: Record<WorkflowStatus, string> = {
    active: "bg-emerald-50 text-emerald-700",
    paused: "bg-amber-50 text-amber-700",
    draft: "bg-slate-100 text-slate-700",
    error: "bg-rose-50 text-rose-700",
  };
  return classes[status];
}

export function notificationClass(type: "info" | "warning" | "critical" | "success") {
  const classes = {
    info: "bg-blue-50 text-blue-700",
    warning: "bg-amber-50 text-amber-700",
    critical: "bg-rose-50 text-rose-700",
    success: "bg-emerald-50 text-emerald-700",
  } as const;
  return classes[type];
}

export function healthClass(status: "online" | "warning" | "offline") {
  const classes = {
    online: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    offline: "bg-rose-50 text-rose-700",
  } as const;
  return classes[status];
}
