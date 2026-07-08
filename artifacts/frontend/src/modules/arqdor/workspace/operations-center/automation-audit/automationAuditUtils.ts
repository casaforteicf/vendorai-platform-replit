import type { AuditSeverity, AutomationStatus, ExecutionStatus } from "./automationAuditTypes";

export function statusClass(status: AutomationStatus) {
  const classes: Record<AutomationStatus, string> = {
    active: "bg-emerald-50 text-emerald-700",
    paused: "bg-amber-50 text-amber-700",
    draft: "bg-slate-100 text-slate-700",
    error: "bg-rose-50 text-rose-700",
  };
  return classes[status];
}

export function executionClass(status: ExecutionStatus) {
  const classes: Record<ExecutionStatus, string> = {
    success: "bg-emerald-50 text-emerald-700",
    failed: "bg-rose-50 text-rose-700",
    running: "bg-violet-50 text-violet-700",
    skipped: "bg-slate-100 text-slate-700",
  };
  return classes[status];
}

export function severityClass(severity: AuditSeverity) {
  const classes: Record<AuditSeverity, string> = {
    info: "bg-blue-50 text-blue-700",
    warning: "bg-amber-50 text-amber-700",
    critical: "bg-rose-50 text-rose-700",
    security: "bg-violet-50 text-violet-700",
  };
  return classes[severity];
}

export function permissionClass(status: "allowed" | "restricted" | "blocked") {
  const classes = {
    allowed: "bg-emerald-50 text-emerald-700",
    restricted: "bg-amber-50 text-amber-700",
    blocked: "bg-rose-50 text-rose-700",
  } as const;
  return classes[status];
}
