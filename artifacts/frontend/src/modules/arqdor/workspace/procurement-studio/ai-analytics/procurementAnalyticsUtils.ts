import type { RiskLevel } from "./procurementAnalyticsTypes";

export function currency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function percent(value: number): string {
  return `${Math.round(value)}%`;
}

export function riskClass(level: RiskLevel) {
  const classes: Record<RiskLevel, string> = {
    baixo: "bg-emerald-50 text-emerald-700",
    medio: "bg-amber-50 text-amber-700",
    alto: "bg-rose-50 text-rose-700",
    critico: "bg-red-100 text-red-800",
  };
  return classes[level];
}

export function statusClass(status: "ativa" | "pausada" | "rascunho") {
  const classes = {
    ativa: "bg-emerald-50 text-emerald-700",
    pausada: "bg-amber-50 text-amber-700",
    rascunho: "bg-slate-100 text-slate-700",
  } as const;
  return classes[status];
}
