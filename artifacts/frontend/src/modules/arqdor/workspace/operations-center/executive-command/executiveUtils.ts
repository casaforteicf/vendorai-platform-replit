import type { ProjectHealth, RiskLevel } from "./executiveTypes";

export function currency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function riskClass(level: RiskLevel) {
  const classes: Record<RiskLevel, string> = {
    baixo: "bg-emerald-50 text-emerald-700",
    medio: "bg-blue-50 text-blue-700",
    alto: "bg-amber-50 text-amber-700",
    critico: "bg-rose-50 text-rose-700",
  };
  return classes[level];
}

export function healthClass(health: ProjectHealth) {
  const classes: Record<ProjectHealth, string> = {
    saudavel: "bg-emerald-50 text-emerald-700",
    atencao: "bg-amber-50 text-amber-700",
    risco: "bg-rose-50 text-rose-700",
    critico: "bg-red-100 text-red-800",
  };
  return classes[health];
}

export function eventClass(status: "normal" | "warning" | "critical" | "success") {
  const classes = {
    normal: "bg-blue-50 text-blue-700",
    warning: "bg-amber-50 text-amber-700",
    critical: "bg-rose-50 text-rose-700",
    success: "bg-emerald-50 text-emerald-700",
  } as const;
  return classes[status];
}
