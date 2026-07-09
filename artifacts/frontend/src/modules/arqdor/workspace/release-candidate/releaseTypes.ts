export type ReleaseView =
  | "overview"
  | "modules"
  | "qa"
  | "bugs"
  | "integrations"
  | "security"
  | "performance"
  | "launch"
  | "acceptance";

export type ReleaseStatus = "ready" | "attention" | "blocked" | "pending";
export type Severity = "low" | "medium" | "high" | "critical";
export type ChecklistStatus = "done" | "review" | "missing";

export type ModuleReadiness = {
  id: string;
  name: string;
  owner: string;
  status: ReleaseStatus;
  progress: number;
  ui: number;
  data: number;
  integration: number;
  risk: Severity;
  summary: string;
};

export type QAItem = {
  id: string;
  area: string;
  title: string;
  status: ChecklistStatus;
  evidence: string;
  owner: string;
};

export type BugItem = {
  id: string;
  title: string;
  module: string;
  severity: Severity;
  status: "open" | "triage" | "fixed" | "wontfix";
  impact: string;
};

export type IntegrationAudit = {
  id: string;
  name: string;
  status: ReleaseStatus;
  endpoint: string;
  coverage: number;
  notes: string;
};

export type SecurityItem = {
  id: string;
  title: string;
  status: ChecklistStatus;
  risk: Severity;
  notes: string;
};

export type PerformanceMetric = {
  id: string;
  label: string;
  value: string;
  target: string;
  status: ReleaseStatus;
};

export type LaunchStep = {
  id: string;
  title: string;
  date: string;
  status: ReleaseStatus;
  owner: string;
  description: string;
};

export type AcceptanceGate = {
  id: string;
  title: string;
  status: ReleaseStatus;
  required: boolean;
  description: string;
};
