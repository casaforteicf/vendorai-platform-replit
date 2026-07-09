export type IntegrationView =
  | "dashboard"
  | "workflow"
  | "modules"
  | "orchestration"
  | "handoff"
  | "rules"
  | "timeline"
  | "health"
  | "ai";

export type ModuleStatus = "connected" | "partial" | "mock" | "error" | "disabled";
export type WorkflowStatus = "active" | "paused" | "draft" | "error";
export type HandoffStatus = "ready" | "waiting" | "blocked" | "completed";

export type ArqdorModule = {
  id: string;
  name: string;
  key: string;
  phase: string;
  status: ModuleStatus;
  dataSource: "real_api" | "mock" | "hybrid";
  dependencies: string[];
  completion: number;
};

export type WorkflowStep = {
  id: string;
  order: number;
  title: string;
  module: string;
  input: string;
  output: string;
  status: HandoffStatus;
  owner: string;
};

export type IntegrationRule = {
  id: string;
  name: string;
  trigger: string;
  sourceModule: string;
  targetModule: string;
  action: string;
  status: WorkflowStatus;
};

export type HandoffItem = {
  id: string;
  from: string;
  to: string;
  payload: string;
  status: HandoffStatus;
  blocker?: string;
};

export type IntegrationEvent = {
  id: string;
  title: string;
  module: string;
  type: "sync" | "handoff" | "approval" | "error" | "automation";
  timestamp: string;
  description: string;
};
