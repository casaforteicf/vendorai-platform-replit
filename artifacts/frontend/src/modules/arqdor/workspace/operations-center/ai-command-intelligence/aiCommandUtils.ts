import type { AgentStatus, DecisionStatus, ImpactLevel } from "./aiCommandTypes";

export function statusClass(status: AgentStatus | DecisionStatus | "active" | "draft" | "review" | "paused" | "ready" | "processing" | "needs_review") {
  const classes: Record<string, string> = {
    online: "bg-emerald-50 text-emerald-700",
    paused: "bg-amber-50 text-amber-700",
    learning: "bg-violet-50 text-violet-700",
    error: "bg-rose-50 text-rose-700",
    suggested: "bg-blue-50 text-blue-700",
    approved: "bg-emerald-50 text-emerald-700",
    rejected: "bg-rose-50 text-rose-700",
    executed: "bg-violet-50 text-violet-700",
    active: "bg-emerald-50 text-emerald-700",
    draft: "bg-slate-100 text-slate-700",
    review: "bg-amber-50 text-amber-700",
    ready: "bg-emerald-50 text-emerald-700",
    processing: "bg-violet-50 text-violet-700",
    needs_review: "bg-amber-50 text-amber-700",
  };
  return classes[status] || "bg-slate-100 text-slate-700";
}

export function impactClass(impact: ImpactLevel) {
  const classes: Record<ImpactLevel, string> = {
    baixo: "bg-emerald-50 text-emerald-700",
    medio: "bg-blue-50 text-blue-700",
    alto: "bg-amber-50 text-amber-700",
    critico: "bg-rose-50 text-rose-700",
  };
  return classes[impact];
}
