export type ExecutiveView =
  | "cockpit"
  | "bi"
  | "predictive"
  | "risks"
  | "capacity"
  | "portfolio"
  | "realtime"
  | "strategy"
  | "reports";

export type RiskLevel = "baixo" | "medio" | "alto" | "critico";
export type ProjectHealth = "saudavel" | "atencao" | "risco" | "critico";

export type ExecutiveKPI = {
  id: string;
  label: string;
  value: string;
  trend: string;
  description: string;
};

export type PortfolioProject = {
  id: string;
  name: string;
  client: string;
  phase: string;
  progress: number;
  budget: number;
  margin: number;
  health: ProjectHealth;
  nextAction: string;
};

export type PredictiveItem = {
  id: string;
  title: string;
  module: string;
  prediction: string;
  probability: number;
  impact: RiskLevel;
  recommendation: string;
};

export type ExecutiveRisk = {
  id: string;
  title: string;
  area: string;
  level: RiskLevel;
  owner: string;
  mitigation: string;
};

export type CapacityItem = {
  id: string;
  team: string;
  capacity: number;
  allocated: number;
  overloadRisk: RiskLevel;
};

export type RealtimeEvent = {
  id: string;
  title: string;
  module: string;
  status: "normal" | "warning" | "critical" | "success";
  timestamp: string;
};
