import type { Severity, WorkStatus } from "./constructionTypes";

export function currency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function statusClass(status: WorkStatus | "available" | "busy" | "registered" | "approved" | "pending" | "changes_requested" | "review" | "open" | "resolved" | "blocked") {
  const classes: Record<string, string> = {
    planned: "bg-slate-100 text-slate-700",
    in_progress: "bg-violet-50 text-violet-700",
    blocked: "bg-rose-50 text-rose-700",
    done: "bg-emerald-50 text-emerald-700",
    delayed: "bg-amber-50 text-amber-700",
    available: "bg-emerald-50 text-emerald-700",
    busy: "bg-blue-50 text-blue-700",
    registered: "bg-blue-50 text-blue-700",
    approved: "bg-emerald-50 text-emerald-700",
    pending: "bg-amber-50 text-amber-700",
    changes_requested: "bg-violet-50 text-violet-700",
    review: "bg-amber-50 text-amber-700",
    open: "bg-rose-50 text-rose-700",
    resolved: "bg-emerald-50 text-emerald-700",
  };
  return classes[status] || "bg-slate-100 text-slate-700";
}

export function severityClass(severity: Severity) {
  const classes: Record<Severity, string> = {
    baixo: "bg-emerald-50 text-emerald-700",
    medio: "bg-blue-50 text-blue-700",
    alto: "bg-amber-50 text-amber-700",
    critico: "bg-rose-50 text-rose-700",
  };
  return classes[severity];
}
