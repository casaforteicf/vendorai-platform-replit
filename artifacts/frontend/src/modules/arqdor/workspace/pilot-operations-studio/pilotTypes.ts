export type PilotView =
  | "overview"
  | "accounts"
  | "projects"
  | "health"
  | "tasks"
  | "feedback"
  | "success"
  | "risks"
  | "handoff";

export type PilotStatus = "active" | "attention" | "blocked" | "completed" | "pending";
export type HealthLevel = "healthy" | "attention" | "risk" | "critical";
export type Priority = "baixa" | "media" | "alta";

export type PilotAccount = {
  id: string;
  name: string;
  segment: string;
  owner: string;
  plan: string;
  status: PilotStatus;
  health: HealthLevel;
  progress: number;
  startDate: string;
  goal: string;
  nextStep: string;
};

export type PilotProject = {
  id: string;
  account: string;
  projectName: string;
  stage: string;
  module: string;
  progress: number;
  status: PilotStatus;
  output: string;
};

export type PilotTask = {
  id: string;
  title: string;
  account: string;
  owner: string;
  due: string;
  priority: Priority;
  status: PilotStatus;
  description: string;
};

export type FeedbackItem = {
  id: string;
  account: string;
  type: "ux" | "bug" | "feature" | "business" | "training";
  title: string;
  quote: string;
  impact: string;
  status: PilotStatus;
};

export type SuccessMetric = {
  id: string;
  label: string;
  value: string;
  target: string;
  status: PilotStatus;
  description: string;
};

export type RiskItem = {
  id: string;
  title: string;
  account: string;
  severity: "low" | "medium" | "high" | "critical";
  status: PilotStatus;
  mitigation: string;
};

export type HandoffItem = {
  id: string;
  title: string;
  area: string;
  status: PilotStatus;
  owner: string;
  evidence: string;
};
