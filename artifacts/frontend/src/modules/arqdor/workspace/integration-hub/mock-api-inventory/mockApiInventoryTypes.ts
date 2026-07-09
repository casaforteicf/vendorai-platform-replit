export type InventoryView =
  | "dashboard"
  | "mocks"
  | "apis"
  | "priority"
  | "contracts"
  | "migration"
  | "risks"
  | "checklist"
  | "reports"
  | "ai";

export type MockStatus = "active" | "replace_next" | "keep_temporarily" | "deprecated" | "removed";
export type ApiStatus = "ready" | "partial" | "missing" | "blocked" | "unknown";
export type PriorityLevel = "baixa" | "media" | "alta" | "critica";

export type MockFileItem = {
  id: string;
  module: string;
  file: string;
  path: string;
  mockType: "static_array" | "local_state" | "placeholder" | "fake_response";
  status: MockStatus;
  priority: PriorityLevel;
  replacementApi: string;
  notes: string;
};

export type ApiInventoryItem = {
  id: string;
  module: string;
  endpoint: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "MIXED";
  status: ApiStatus;
  coverage: number;
  owner: string;
};

export type DataContractItem = {
  id: string;
  entity: string;
  canonicalId: string;
  usedBy: string[];
  required: boolean;
  status: "defined" | "missing" | "review" | "deprecated";
};

export type MigrationPriority = {
  id: string;
  module: string;
  order: number;
  reason: string;
  dependency: string;
  priority: PriorityLevel;
};

export type InventoryRisk = {
  id: string;
  title: string;
  module: string;
  risk: PriorityLevel;
  impact: string;
  mitigation: string;
};

export type InventoryChecklistItem = {
  id: string;
  title: string;
  category: string;
  checked: boolean;
  owner: string;
};
