export type RevenueView =
  | "overview"
  | "pipeline"
  | "demos"
  | "proposals"
  | "subscriptions"
  | "partners"
  | "success"
  | "forecast"
  | "playbook";

export type DealStage =
  | "lead"
  | "qualified"
  | "demo"
  | "proposal"
  | "pilot"
  | "contract"
  | "won"
  | "lost";

export type RevenueStatus = "active" | "attention" | "blocked" | "completed" | "pending";
export type Priority = "baixa" | "media" | "alta";

export type RevenueDeal = {
  id: string;
  company: string;
  segment: string;
  contact: string;
  stage: DealStage;
  plan: string;
  value: string;
  setup: string;
  probability: number;
  owner: string;
  nextStep: string;
  status: RevenueStatus;
};

export type DemoEvent = {
  id: string;
  company: string;
  date: string;
  audience: string;
  objective: string;
  status: RevenueStatus;
  owner: string;
};

export type ProposalItem = {
  id: string;
  company: string;
  packageName: string;
  mrr: string;
  setup: string;
  deadline: string;
  status: RevenueStatus;
  blockers: string;
};

export type SubscriptionMetric = {
  id: string;
  label: string;
  value: string;
  target: string;
  status: RevenueStatus;
  description: string;
};

export type PartnerItem = {
  id: string;
  name: string;
  type: "fornecedor" | "fabricante" | "representante" | "loja" | "consultor";
  opportunity: string;
  model: string;
  status: RevenueStatus;
  priority: Priority;
};

export type SuccessAccount = {
  id: string;
  company: string;
  plan: string;
  health: number;
  adoption: number;
  risk: string;
  expansion: string;
  status: RevenueStatus;
};

export type ForecastItem = {
  id: string;
  month: string;
  newMrr: string;
  setupRevenue: string;
  churnRisk: string;
  confidence: number;
};

export type SalesPlaybookItem = {
  id: string;
  title: string;
  context: string;
  message: string;
  proof: string;
  close: string;
};
