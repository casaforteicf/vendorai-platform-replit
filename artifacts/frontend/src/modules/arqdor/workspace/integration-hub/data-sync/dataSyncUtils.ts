import type { ConflictSeverity, SourceStatus, SyncStatus } from "./dataSyncTypes";

export function statusClass(status: SourceStatus | SyncStatus | "stable" | "draft" | "deprecated" | "review" | "open" | "resolved") {
  const classes: Record<string, string> = {
    connected: "bg-emerald-50 text-emerald-700",
    partial: "bg-blue-50 text-blue-700",
    mock: "bg-amber-50 text-amber-700",
    error: "bg-rose-50 text-rose-700",
    disabled: "bg-slate-100 text-slate-700",
    idle: "bg-slate-100 text-slate-700",
    running: "bg-violet-50 text-violet-700",
    success: "bg-emerald-50 text-emerald-700",
    failed: "bg-rose-50 text-rose-700",
    waiting: "bg-amber-50 text-amber-700",
    stable: "bg-emerald-50 text-emerald-700",
    draft: "bg-slate-100 text-slate-700",
    deprecated: "bg-rose-50 text-rose-700",
    review: "bg-amber-50 text-amber-700",
    open: "bg-rose-50 text-rose-700",
    resolved: "bg-emerald-50 text-emerald-700",
  };
  return classes[status] || "bg-slate-100 text-slate-700";
}

export function severityClass(severity: ConflictSeverity) {
  const classes: Record<ConflictSeverity, string> = {
    baixo: "bg-emerald-50 text-emerald-700",
    medio: "bg-blue-50 text-blue-700",
    alto: "bg-amber-50 text-amber-700",
    critico: "bg-rose-50 text-rose-700",
  };
  return classes[severity];
}

export function percent(current: number, total: number): number {
  if (!total) return 0;
  return Math.round((current / total) * 100);
}
