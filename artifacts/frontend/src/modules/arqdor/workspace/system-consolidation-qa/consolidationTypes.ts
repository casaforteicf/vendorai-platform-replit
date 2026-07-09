export type SprintStatus =
  | "not-applied"
  | "applied"
  | "typecheck-ok"
  | "needs-fix"
  | "blocked"
  | "validated";

export type ModuleKind =
  | "core"
  | "render"
  | "specification"
  | "budget"
  | "portal"
  | "production"
  | "post-sale"
  | "admin"
  | "integration";

export type ModuleHealth =
  | "green"
  | "yellow"
  | "red"
  | "unknown";

export type ReleaseGateStatus =
  | "pending"
  | "passed"
  | "failed"
  | "waived";

export type EndpointMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type ArqdorModule = {
  id: string;
  sprint: string;
  label: string;
  kind: ModuleKind;
  routeKeys: string[];
  importPath: string;
  componentName: string;
  required: boolean;
  description: string;
  expectedEndpoints: EndpointContract[];
  status: SprintStatus;
  health: ModuleHealth;
  notes?: string | null;
};

export type EndpointContract = {
  method: EndpointMethod;
  path: string;
  required: boolean;
  moduleId: string;
  description: string;
};

export type EndpointHealth = EndpointContract & {
  health: ModuleHealth;
  lastStatus?: number | null;
  lastCheckedAt?: string | null;
  error?: string | null;
};

export type MockDebtItem = {
  id: string;
  moduleId: string;
  filePath: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  recommendation: string;
  status: "open" | "in-progress" | "resolved" | "accepted";
};

export type ReleaseGate = {
  id: string;
  label: string;
  description: string;
  status: ReleaseGateStatus;
  owner?: string | null;
  evidence?: string | null;
};

export type NavigationFlowStep = {
  id: string;
  label: string;
  moduleId: string;
  routeKey: string;
  required: boolean;
  dependsOn?: string[];
};

export type TenantSecurityCheck = {
  id: string;
  label: string;
  description: string;
  status: ReleaseGateStatus;
  risk: "low" | "medium" | "high" | "critical";
};

export type SystemConsolidationBundle = {
  modules: ArqdorModule[];
  endpoints: EndpointHealth[];
  mockDebts: MockDebtItem[];
  releaseGates: ReleaseGate[];
  flow: NavigationFlowStep[];
  securityChecks: TenantSecurityCheck[];
};

export type ApiResult<T> = {
  data?: T;
  error?: string;
};
