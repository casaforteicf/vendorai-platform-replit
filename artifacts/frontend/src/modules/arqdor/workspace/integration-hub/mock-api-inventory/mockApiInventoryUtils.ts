import type { ApiStatus, MockStatus, PriorityLevel } from "./mockApiInventoryTypes";

export function statusClass(status: MockStatus | ApiStatus | "defined" | "missing" | "review" | "deprecated") {
  const classes: Record<string, string> = {
    active: "bg-blue-50 text-blue-700",
    replace_next: "bg-amber-50 text-amber-700",
    keep_temporarily: "bg-slate-100 text-slate-700",
    removed: "bg-emerald-50 text-emerald-700",
    ready: "bg-emerald-50 text-emerald-700",
    partial: "bg-blue-50 text-blue-700",
    missing: "bg-rose-50 text-rose-700",
    blocked: "bg-rose-50 text-rose-700",
    unknown: "bg-slate-100 text-slate-700",
    defined: "bg-emerald-50 text-emerald-700",
    review: "bg-amber-50 text-amber-700",
    deprecated: "bg-slate-100 text-slate-700",
  };
  return classes[status] || "bg-slate-100 text-slate-700";
}

export function priorityClass(priority: PriorityLevel) {
  const classes: Record<PriorityLevel, string> = {
    baixa: "bg-emerald-50 text-emerald-700",
    media: "bg-blue-50 text-blue-700",
    alta: "bg-amber-50 text-amber-700",
    critica: "bg-rose-50 text-rose-700",
  };
  return classes[priority];
}
