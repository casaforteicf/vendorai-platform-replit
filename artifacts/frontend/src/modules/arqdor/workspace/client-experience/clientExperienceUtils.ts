import type { ApprovalStatus, TimelineStatus } from "./clientExperienceTypes";

export function currency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function approvalClass(status: ApprovalStatus) {
  const classes: Record<ApprovalStatus, string> = {
    pending: "bg-amber-50 text-amber-700",
    approved: "bg-emerald-50 text-emerald-700",
    rejected: "bg-rose-50 text-rose-700",
    changes_requested: "bg-violet-50 text-violet-700",
  };
  return classes[status];
}

export function timelineClass(status: TimelineStatus) {
  const classes: Record<TimelineStatus, string> = {
    done: "bg-emerald-50 text-emerald-700",
    active: "bg-violet-50 text-violet-700",
    pending: "bg-slate-100 text-slate-700",
    blocked: "bg-rose-50 text-rose-700",
  };
  return classes[status];
}

export function fileClass(status: "available" | "pending" | "expired") {
  const classes = {
    available: "bg-emerald-50 text-emerald-700",
    pending: "bg-amber-50 text-amber-700",
    expired: "bg-rose-50 text-rose-700",
  } as const;
  return classes[status];
}

export function financialClass(status: "paid" | "pending" | "overdue" | "scheduled") {
  const classes = {
    paid: "bg-emerald-50 text-emerald-700",
    pending: "bg-amber-50 text-amber-700",
    overdue: "bg-rose-50 text-rose-700",
    scheduled: "bg-blue-50 text-blue-700",
  } as const;
  return classes[status];
}
