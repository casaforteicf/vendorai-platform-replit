import type { AssetStatus, Priority, TicketStatus, WarrantyStatus } from "./facilityTypes";

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function statusClass(status: AssetStatus | WarrantyStatus | TicketStatus | "scheduled" | "done" | "delayed" | "available" | "pending" | "expired") {
  const classes: Record<string, string> = {
    operational: "bg-emerald-50 text-emerald-700",
    maintenance: "bg-violet-50 text-violet-700",
    attention: "bg-amber-50 text-amber-700",
    inactive: "bg-slate-100 text-slate-700",
    active: "bg-emerald-50 text-emerald-700",
    expiring: "bg-amber-50 text-amber-700",
    expired: "bg-rose-50 text-rose-700",
    pending: "bg-amber-50 text-amber-700",
    open: "bg-rose-50 text-rose-700",
    in_progress: "bg-violet-50 text-violet-700",
    waiting: "bg-blue-50 text-blue-700",
    resolved: "bg-emerald-50 text-emerald-700",
    scheduled: "bg-blue-50 text-blue-700",
    done: "bg-emerald-50 text-emerald-700",
    delayed: "bg-rose-50 text-rose-700",
    available: "bg-emerald-50 text-emerald-700",
  };
  return classes[status] || "bg-slate-100 text-slate-700";
}

export function priorityClass(priority: Priority) {
  const classes: Record<Priority, string> = {
    baixa: "bg-emerald-50 text-emerald-700",
    media: "bg-blue-50 text-blue-700",
    alta: "bg-amber-50 text-amber-700",
    critica: "bg-rose-50 text-rose-700",
  };
  return classes[priority];
}
