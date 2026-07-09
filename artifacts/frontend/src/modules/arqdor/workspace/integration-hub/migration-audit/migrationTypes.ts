export type MigrationView =
  | "dashboard"
  | "migration"
  | "mocks"
  | "audit"
  | "trace"
  | "timeline"
  | "rollback"
  | "checklist"
  | "reports"
  | "ai";

export type MigrationStatus = "not_started" | "planned" | "running" | "completed" | "blocked" | "failed";
export type AuditSeverity = "info" | "warning" | "high" | "critical";
export type MockRisk = "baixo" | "medio" | "alto" | "critico";

export type MigrationItem = {
  id: string;
  module: string;
  title: string;
  from: string;
  to: string;
  status: MigrationStatus;
  progress: number;
  owner: string;
  blocker?: string;
};

export type MockInventoryItem = {
  id: string;
  module: string;
  file: string;
  mockType: "static_data" | "local_state" | "fake_api" | "placeholder";
  replacementApi: string;
  risk: MockRisk;
  status: MigrationStatus;
};

export type AuditTrace = {
  id: string;
  title: string;
  module: string;
  actor: string;
  severity: AuditSeverity;
  timestamp: string;
  details: string;
};

export type TraceLink = {
  id: string;
  entity: string;
  origin: string;
  destination: string;
  traceId: string;
  status: "valid" | "broken" | "partial";
};

export type MigrationTimelineEvent = {
  id: string;
  date: string;
  title: string;
  description: string;
  status: MigrationStatus;
};

export type RollbackPlan = {
  id: string;
  module: string;
  trigger: string;
  action: string;
  owner: string;
  status: "ready" | "draft" | "missing";
};

export type MigrationChecklistItem = {
  id: string;
  title: string;
  category: string;
  checked: boolean;
  owner: string;
};
