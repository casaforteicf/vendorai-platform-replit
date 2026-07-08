export type AutomationAuditView =
  | "dashboard"
  | "automations"
  | "rules"
  | "executions"
  | "audit"
  | "permissions"
  | "incidents"
  | "reports";

export type AutomationStatus = "active" | "paused" | "draft" | "error";
export type ExecutionStatus = "success" | "failed" | "running" | "skipped";
export type AuditSeverity = "info" | "warning" | "critical" | "security";

export type AutomationRule = {
  id: string;
  name: string;
  module: string;
  trigger: string;
  action: string;
  status: AutomationStatus;
  executions: number;
  successRate: number;
  lastRun: string;
};

export type ExecutionLog = {
  id: string;
  automation: string;
  module: string;
  status: ExecutionStatus;
  startedAt: string;
  duration: string;
  output: string;
};

export type AuditEvent = {
  id: string;
  title: string;
  module: string;
  actor: string;
  severity: AuditSeverity;
  date: string;
  details: string;
};

export type PermissionItem = {
  id: string;
  role: string;
  module: string;
  permission: string;
  status: "allowed" | "restricted" | "blocked";
};

export type IncidentItem = {
  id: string;
  title: string;
  module: string;
  severity: AuditSeverity;
  status: "open" | "investigating" | "resolved";
  owner: string;
  createdAt: string;
};
