import type { ClashSeverity, ElementStatus, ModelVersionStatus } from "./bimTypes";

export function statusClass(status: ElementStatus | ModelVersionStatus | "open" | "review" | "resolved" | "ready" | "processing" | "done" | "failed") {
  const classes: Record<string, string> = {
    ok: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    clash: "bg-rose-50 text-rose-700",
    missing: "bg-slate-100 text-slate-700",
    updated: "bg-blue-50 text-blue-700",
    current: "bg-violet-50 text-violet-700",
    archived: "bg-slate-100 text-slate-700",
    published: "bg-emerald-50 text-emerald-700",
    review: "bg-amber-50 text-amber-700",
    open: "bg-rose-50 text-rose-700",
    resolved: "bg-emerald-50 text-emerald-700",
    ready: "bg-blue-50 text-blue-700",
    processing: "bg-violet-50 text-violet-700",
    done: "bg-emerald-50 text-emerald-700",
    failed: "bg-rose-50 text-rose-700",
  };
  return classes[status] || "bg-slate-100 text-slate-700";
}

export function severityClass(severity: ClashSeverity) {
  const classes: Record<ClashSeverity, string> = {
    baixo: "bg-emerald-50 text-emerald-700",
    medio: "bg-blue-50 text-blue-700",
    alto: "bg-amber-50 text-amber-700",
    critico: "bg-rose-50 text-rose-700",
  };
  return classes[severity];
}
