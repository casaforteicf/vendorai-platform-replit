export type ConsolidationView =
  | "overview"
  | "inventory"
  | "mock-real"
  | "api"
  | "data"
  | "integration"
  | "testing"
  | "priorities"
  | "release"
  | "handoff";

export type ConsolidationStatus = "real" | "partial" | "mock" | "blocked" | "ready";
export type Priority = "baixa" | "media" | "alta" | "critica";
export type Effort = "baixo" | "medio" | "alto";

export type ModuleInventoryItem = {
  id: string;
  module: string;
  sprint: string;
  routeKey: string;
  frontendStatus: ConsolidationStatus;
  backendStatus: ConsolidationStatus;
  dataStatus: ConsolidationStatus;
  risk: Priority;
  summary: string;
};

export type MockRealItem = {
  id: string;
  area: string;
  currentState: string;
  targetState: string;
  action: string;
  priority: Priority;
  effort: Effort;
  status: ConsolidationStatus;
};

export type ApiEndpointItem = {
  id: string;
  endpoint: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  module: string;
  currentUsage: string;
  targetUsage: string;
  status: ConsolidationStatus;
};

export type DataEntityItem = {
  id: string;
  entity: string;
  module: string;
  source: string;
  persistence: ConsolidationStatus;
  tenantScoped: boolean;
  notes: string;
};

export type IntegrationTask = {
  id: string;
  title: string;
  from: string;
  to: string;
  description: string;
  priority: Priority;
  effort: Effort;
  status: ConsolidationStatus;
};

export type TestCaseItem = {
  id: string;
  scenario: string;
  module: string;
  expected: string;
  type: "unit" | "integration" | "e2e" | "manual";
  status: ConsolidationStatus;
};

export type PriorityTask = {
  id: string;
  title: string;
  reason: string;
  impact: string;
  priority: Priority;
  effort: Effort;
  owner: string;
};

export type ReleaseGateItem = {
  id: string;
  title: string;
  required: boolean;
  status: ConsolidationStatus;
  evidence: string;
};

export type HandoffItem = {
  id: string;
  destination: string;
  title: string;
  instructions: string;
  status: ConsolidationStatus;
};
