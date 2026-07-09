export type DataSyncView =
  | "dashboard"
  | "sources"
  | "apis"
  | "eventbus"
  | "schemas"
  | "mappings"
  | "jobs"
  | "conflicts"
  | "logs"
  | "ai";

export type SourceStatus = "connected" | "partial" | "mock" | "error" | "disabled";
export type SyncStatus = "idle" | "running" | "success" | "failed" | "waiting";
export type ConflictSeverity = "baixo" | "medio" | "alto" | "critico";

export type DataSource = {
  id: string;
  name: string;
  module: string;
  endpoint: string;
  status: SourceStatus;
  records: number;
  lastSync: string;
  mode: "read" | "write" | "read_write";
};

export type APIConnector = {
  id: string;
  name: string;
  basePath: string;
  module: string;
  auth: "tenant" | "public" | "service" | "manual";
  status: SourceStatus;
  coverage: number;
};

export type EventBusTopic = {
  id: string;
  topic: string;
  publisher: string;
  subscribers: string[];
  events24h: number;
  status: SourceStatus;
};

export type SchemaContract = {
  id: string;
  name: string;
  entity: string;
  owner: string;
  version: string;
  fields: number;
  status: "stable" | "draft" | "deprecated" | "review";
};

export type DataMapping = {
  id: string;
  from: string;
  to: string;
  entity: string;
  fieldsMapped: number;
  fieldsTotal: number;
  status: SyncStatus;
};

export type SyncJob = {
  id: string;
  name: string;
  source: string;
  target: string;
  status: SyncStatus;
  frequency: string;
  lastRun: string;
  recordsSynced: number;
};

export type SyncConflict = {
  id: string;
  title: string;
  entity: string;
  sourceA: string;
  sourceB: string;
  severity: ConflictSeverity;
  status: "open" | "review" | "resolved";
  recommendation: string;
};

export type SyncLog = {
  id: string;
  title: string;
  module: string;
  status: SyncStatus;
  timestamp: string;
  detail: string;
};
