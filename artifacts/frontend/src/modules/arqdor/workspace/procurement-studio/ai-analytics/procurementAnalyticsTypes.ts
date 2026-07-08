export type AnalyticsView =
  | "dashboard"
  | "kpis"
  | "suppliers"
  | "leadtime"
  | "cost"
  | "forecast"
  | "risks"
  | "automation"
  | "reports";

export type RiskLevel = "baixo" | "medio" | "alto" | "critico";

export type ProcurementKPI = {
  id: string;
  label: string;
  value: string;
  change: string;
  description: string;
};

export type SupplierPerformance = {
  id: string;
  name: string;
  category: string;
  score: number;
  onTimeRate: number;
  avgLeadTime: number;
  totalPurchased: number;
  risk: RiskLevel;
};

export type CostOptimizationItem = {
  id: string;
  title: string;
  currentCost: number;
  optimizedCost: number;
  saving: number;
  action: string;
};

export type RiskItem = {
  id: string;
  title: string;
  description: string;
  level: RiskLevel;
  owner: string;
  recommendedAction: string;
};

export type ForecastItem = {
  id: string;
  month: string;
  expectedSpend: number;
  confirmedSpend: number;
  riskSpend: number;
};

export type AutomationRule = {
  id: string;
  title: string;
  trigger: string;
  action: string;
  status: "ativa" | "pausada" | "rascunho";
};
