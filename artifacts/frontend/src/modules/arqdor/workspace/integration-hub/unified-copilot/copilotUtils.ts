import type { ActionStatus, AgentStatus, HealthStatus } from "./copilotTypes";

export function statusClass(status: AgentStatus | ActionStatus | HealthStatus | "active" | "draft" | "paused") {
  const classes: Record<string, string> = {
    online: "bg-emerald-50 text-emerald-700",
    idle: "bg-slate-100 text-slate-700",
    learning: "bg-violet-50 text-violet-700",
    warning: "bg-amber-50 text-amber-700",
    error: "bg-rose-50 text-rose-700",
    suggested: "bg-blue-50 text-blue-700",
    approved: "bg-emerald-50 text-emerald-700",
    running: "bg-violet-50 text-violet-700",
    completed: "bg-emerald-50 text-emerald-700",
    blocked: "bg-rose-50 text-rose-700",
    healthy: "bg-emerald-50 text-emerald-700",
    critical: "bg-rose-50 text-rose-700",
    offline: "bg-slate-100 text-slate-700",
    active: "bg-emerald-50 text-emerald-700",
    draft: "bg-slate-100 text-slate-700",
    paused: "bg-amber-50 text-amber-700",
  };
  return classes[status] || "bg-slate-100 text-slate-700";
}

export function impactClass(impact: "baixo" | "medio" | "alto" | "critico") {
  const classes = {
    baixo: "bg-emerald-50 text-emerald-700",
    medio: "bg-blue-50 text-blue-700",
    alto: "bg-amber-50 text-amber-700",
    critico: "bg-rose-50 text-rose-700",
  } as const;
  return classes[impact];
}
