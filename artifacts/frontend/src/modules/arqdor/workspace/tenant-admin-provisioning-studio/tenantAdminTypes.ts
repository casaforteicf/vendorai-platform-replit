export type AdminView =
  | "overview"
  | "tenants"
  | "provisioning"
  | "users"
  | "roles"
  | "features"
  | "limits"
  | "integrations"
  | "audit"
  | "health";

export type AdminStatus = "active" | "attention" | "blocked" | "completed" | "pending";
export type TenantPlan = "Start" | "Pro" | "Enterprise" | "Marketplace";
export type TenantHealth = "healthy" | "attention" | "risk" | "critical";

export type TenantAccount = {
  id: string;
  name: string;
  slug: string;
  plan: TenantPlan;
  owner: string;
  users: number;
  projects: number;
  status: AdminStatus;
  health: TenantHealth;
  createdAt: string;
  region: string;
  nextAction: string;
};

export type ProvisioningStep = {
  id: string;
  tenant: string;
  step: string;
  description: string;
  status: AdminStatus;
  owner: string;
  eta: string;
};

export type UserAccount = {
  id: string;
  name: string;
  email: string;
  tenant: string;
  role: string;
  lastAccess: string;
  status: AdminStatus;
};

export type RolePolicy = {
  id: string;
  role: string;
  scope: string;
  permissions: string[];
  risk: "baixo" | "medio" | "alto";
  status: AdminStatus;
};

export type FeatureFlag = {
  id: string;
  name: string;
  description: string;
  enabledFor: string;
  rollout: number;
  status: AdminStatus;
};

export type UsageLimit = {
  id: string;
  tenant: string;
  plan: TenantPlan;
  renders: string;
  storage: string;
  aiActions: string;
  users: string;
  status: AdminStatus;
};

export type IntegrationStatus = {
  id: string;
  tenant: string;
  channel: string;
  provider: string;
  status: AdminStatus;
  lastSync: string;
  notes: string;
};

export type AuditEvent = {
  id: string;
  actor: string;
  tenant: string;
  action: string;
  module: string;
  date: string;
  severity: "low" | "medium" | "high";
};

export type SystemHealth = {
  id: string;
  service: string;
  uptime: string;
  latency: string;
  status: AdminStatus;
  notes: string;
};
