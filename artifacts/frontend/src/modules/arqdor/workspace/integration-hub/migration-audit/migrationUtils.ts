import type { AuditSeverity, MigrationStatus, MockRisk } from "./migrationTypes";

export function statusClass(status: MigrationStatus | "valid" | "broken" | "partial" | "ready" | "draft" | "missing") {
  const classes: Record<string, string> = {
    not_started: "bg-slate-100 text-slate-700",
    planned: "bg-blue-50 text-blue-700",
    running: "bg-violet-50 text-violet-700",
    completed: "bg-emerald-50 text-emerald-700",
    blocked: "bg-rose-50 text-rose-700",
    failed: "bg-red-100 text-red-800",
    valid: "bg-emerald-50 text-emerald-700",
    broken: "bg-rose-50 text-rose-700",
    partial: "bg-amber-50 text-amber-700",
    ready: "bg-emerald-50 text-emerald-700",
    draft: "bg-slate-100 text-slate-700",
    missing: "bg-rose-50 text-rose-700",
  };
  return classes[status] || "bg-slate-100 text-slate-700";
}

export function severityClass(severity: AuditSeverity | MockRisk) {
  const classes: Record<string, string> = {
    info: "bg-blue-50 text-blue-700",
    warning: "bg-amber-50 text-amber-700",
    high: "bg-orange-50 text-orange-700",
    critical: "bg-rose-50 text-rose-700",
    baixo: "bg-emerald-50 text-emerald-700",
    medio: "bg-blue-50 text-blue-700",
    alto: "bg-amber-50 text-amber-700",
    critico: "bg-rose-50 text-rose-700",
  };
  return classes[severity] || "bg-slate-100 text-slate-700";
}
