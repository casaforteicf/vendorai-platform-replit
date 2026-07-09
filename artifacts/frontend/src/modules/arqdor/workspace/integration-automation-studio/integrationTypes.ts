export type IntegrationView =
  | "overview"
  | "channels"
  | "webhooks"
  | "automations"
  | "providers"
  | "sync"
  | "logs"
  | "templates"
  | "security"
  | "health";

export type IntegrationStatus = "connected" | "attention" | "pending" | "failed" | "disabled";
export type AutomationStatus = "active" | "draft" | "paused" | "failed";
export type Severity = "low" | "medium" | "high" | "critical";

export type ChannelIntegration = {
  id: string;
  name: string;
  provider: string;
  useCase: string;
  tenant: string;
  status: IntegrationStatus;
  lastEvent: string;
  nextAction: string;
};

export type WebhookEndpoint = {
  id: string;
  name: string;
  path: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  source: string;
  target: string;
  status: IntegrationStatus;
  events: number;
};

export type AutomationFlow = {
  id: string;
  name: string;
  trigger: string;
  actions: string[];
  owner: string;
  status: AutomationStatus;
  successRate: number;
  lastRun: string;
};

export type ProviderConnection = {
  id: string;
  provider: string;
  category: string;
  credentialMode: string;
  status: IntegrationStatus;
  scope: string;
  notes: string;
};

export type SyncJob = {
  id: string;
  name: string;
  source: string;
  destination: string;
  frequency: string;
  lastSync: string;
  status: IntegrationStatus;
  records: number;
};

export type IntegrationLog = {
  id: string;
  date: string;
  service: string;
  event: string;
  status: IntegrationStatus;
  severity: Severity;
  details: string;
};

export type TemplateFlow = {
  id: string;
  name: string;
  category: string;
  description: string;
  modules: string[];
  status: IntegrationStatus;
};

export type SecurityCheck = {
  id: string;
  title: string;
  scope: string;
  severity: Severity;
  status: IntegrationStatus;
  recommendation: string;
};

export type HealthCheck = {
  id: string;
  service: string;
  uptime: string;
  latency: string;
  errorRate: string;
  status: IntegrationStatus;
  notes: string;
};
