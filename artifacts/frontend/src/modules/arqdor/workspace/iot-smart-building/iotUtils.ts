import type { AlertSeverity, DeviceStatus } from "./iotTypes";

export function currency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function statusClass(status: DeviceStatus | "open" | "acknowledged" | "resolved" | "active" | "paused" | "draft") {
  const classes: Record<string, string> = {
    online: "bg-emerald-50 text-emerald-700",
    offline: "bg-rose-50 text-rose-700",
    warning: "bg-amber-50 text-amber-700",
    maintenance: "bg-violet-50 text-violet-700",
    open: "bg-rose-50 text-rose-700",
    acknowledged: "bg-amber-50 text-amber-700",
    resolved: "bg-emerald-50 text-emerald-700",
    active: "bg-emerald-50 text-emerald-700",
    paused: "bg-amber-50 text-amber-700",
    draft: "bg-slate-100 text-slate-700",
  };
  return classes[status] || "bg-slate-100 text-slate-700";
}

export function severityClass(severity: AlertSeverity) {
  const classes: Record<AlertSeverity, string> = {
    baixo: "bg-emerald-50 text-emerald-700",
    medio: "bg-blue-50 text-blue-700",
    alto: "bg-amber-50 text-amber-700",
    critico: "bg-rose-50 text-rose-700",
  };
  return classes[severity];
}
