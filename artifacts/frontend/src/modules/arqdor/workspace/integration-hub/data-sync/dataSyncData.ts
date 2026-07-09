import type { APIConnector, DataMapping, DataSource, EventBusTopic, SchemaContract, SyncConflict, SyncJob, SyncLog } from "./dataSyncTypes";

export const dataSources: DataSource[] = [
  { id: "ds-001", name: "Projetos", module: "Project Studio", endpoint: "/arch/projetos", status: "connected", records: 42, lastSync: "Agora", mode: "read_write" },
  { id: "ds-002", name: "Ambientes", module: "Project Studio", endpoint: "/arch/projetos/:id/ambientes", status: "connected", records: 128, lastSync: "3 min", mode: "read_write" },
  { id: "ds-003", name: "Catálogo", module: "Library / Catalog", endpoint: "/arch/catalogo", status: "partial", records: 380, lastSync: "12 min", mode: "read_write" },
  { id: "ds-004", name: "Marketplace", module: "Marketplace", endpoint: "/arch/marketplace/*", status: "partial", records: 76, lastSync: "18 min", mode: "read" },
  { id: "ds-005", name: "Orçamento", module: "Budget", endpoint: "/arch/orcamento/*", status: "partial", records: 31, lastSync: "25 min", mode: "read_write" },
  { id: "ds-006", name: "Renders Gallery", module: "Render", endpoint: "/arch/renders/gallery", status: "partial", records: 94, lastSync: "9 min", mode: "read" },
  { id: "ds-007", name: "Construction", module: "Construction Hub", endpoint: "/arch/construction/*", status: "mock", records: 0, lastSync: "—", mode: "read_write" },
  { id: "ds-008", name: "Facility", module: "Facility Management", endpoint: "/arch/facility/*", status: "mock", records: 0, lastSync: "—", mode: "read_write" },
];

export const apiConnectors: APIConnector[] = [
  { id: "api-001", name: "Project API", basePath: "/arch/projetos", module: "Project Studio", auth: "tenant", status: "connected", coverage: 94 },
  { id: "api-002", name: "Catalog API", basePath: "/arch/catalogo", module: "Library", auth: "tenant", status: "partial", coverage: 72 },
  { id: "api-003", name: "Marketplace API", basePath: "/arch/marketplace", module: "Marketplace", auth: "tenant", status: "partial", coverage: 58 },
  { id: "api-004", name: "Budget API", basePath: "/arch/orcamento", module: "Budget", auth: "tenant", status: "partial", coverage: 64 },
  { id: "api-005", name: "Portal API", basePath: "/arch/portal", module: "Client Experience", auth: "public", status: "connected", coverage: 82 },
  { id: "api-006", name: "Construction API", basePath: "/arch/construction", module: "Construction Hub", auth: "tenant", status: "mock", coverage: 0 },
];

export const eventTopics: EventBusTopic[] = [
  { id: "topic-001", topic: "project.created", publisher: "Project Studio", subscribers: ["Render", "Specification", "Client"], events24h: 12, status: "connected" },
  { id: "topic-002", topic: "render.approved", publisher: "Render", subscribers: ["Specification", "Client"], events24h: 8, status: "partial" },
  { id: "topic-003", topic: "specification.approved", publisher: "Specification", subscribers: ["Budget", "Marketplace"], events24h: 5, status: "partial" },
  { id: "topic-004", topic: "budget.approved", publisher: "Client", subscribers: ["Procurement", "Production"], events24h: 2, status: "mock" },
  { id: "topic-005", topic: "construction.delivered", publisher: "Construction Hub", subscribers: ["Facility", "Client"], events24h: 0, status: "mock" },
];

export const schemaContracts: SchemaContract[] = [
  { id: "sc-001", name: "ProjectContract", entity: "project", owner: "Project Studio", version: "1.0.0", fields: 18, status: "stable" },
  { id: "sc-002", name: "EnvironmentContract", entity: "environment", owner: "Project Studio", version: "1.0.0", fields: 12, status: "stable" },
  { id: "sc-003", name: "SpecificationItemContract", entity: "specification_item", owner: "Specification", version: "0.8.0", fields: 24, status: "review" },
  { id: "sc-004", name: "BudgetItemContract", entity: "budget_item", owner: "Budget", version: "0.7.0", fields: 22, status: "draft" },
  { id: "sc-005", name: "PurchaseRequestContract", entity: "purchase_request", owner: "Procurement", version: "0.5.0", fields: 19, status: "draft" },
];

export const dataMappings: DataMapping[] = [
  { id: "map-001", from: "Project", to: "Render", entity: "project", fieldsMapped: 15, fieldsTotal: 18, status: "success" },
  { id: "map-002", from: "Render", to: "Specification", entity: "object_detection", fieldsMapped: 14, fieldsTotal: 21, status: "waiting" },
  { id: "map-003", from: "Specification", to: "Budget", entity: "specification_item", fieldsMapped: 18, fieldsTotal: 24, status: "running" },
  { id: "map-004", from: "Budget", to: "Procurement", entity: "purchase_request", fieldsMapped: 9, fieldsTotal: 19, status: "waiting" },
  { id: "map-005", from: "Construction", to: "Facility", entity: "facility_asset", fieldsMapped: 0, fieldsTotal: 20, status: "idle" },
];

export const syncJobs: SyncJob[] = [
  { id: "job-001", name: "Sync projetos e ambientes", source: "Project API", target: "Global State", status: "success", frequency: "on_change", lastRun: "Agora", recordsSynced: 42 },
  { id: "job-002", name: "Sync catálogo", source: "Catalog API", target: "Library Module", status: "success", frequency: "15 min", lastRun: "12 min", recordsSynced: 380 },
  { id: "job-003", name: "Sync especificação → orçamento", source: "Specification", target: "Budget", status: "running", frequency: "on_approval", lastRun: "Agora", recordsSynced: 18 },
  { id: "job-004", name: "Sync orçamento → compras", source: "Budget", target: "Procurement", status: "waiting", frequency: "on_client_approval", lastRun: "—", recordsSynced: 0 },
  { id: "job-005", name: "Sync obra → facility", source: "Construction", target: "Facility", status: "idle", frequency: "on_delivery", lastRun: "—", recordsSynced: 0 },
];

export const syncConflicts: SyncConflict[] = [
  {
    id: "cf-001",
    title: "Produto sem ID único entre Specification e Budget",
    entity: "specification_item",
    sourceA: "Specification Studio",
    sourceB: "Executive Budget",
    severity: "alto",
    status: "open",
    recommendation: "Criar campo canonicalProductId no contrato de dados.",
  },
  {
    id: "cf-002",
    title: "Fornecedor duplicado no Marketplace e Procurement",
    entity: "supplier",
    sourceA: "Marketplace",
    sourceB: "Procurement",
    severity: "medio",
    status: "review",
    recommendation: "Normalizar supplierTaxId e criar regra de merge.",
  },
  {
    id: "cf-003",
    title: "Ambiente com nome divergente",
    entity: "environment",
    sourceA: "Project Studio",
    sourceB: "Construction Hub",
    severity: "baixo",
    status: "open",
    recommendation: "Usar environmentId como chave primária em todos os módulos.",
  },
];

export const syncLogs: SyncLog[] = [
  { id: "lg-001", title: "Project sync completed", module: "Project Studio", status: "success", timestamp: "Agora", detail: "42 projetos sincronizados." },
  { id: "lg-002", title: "Catalog sync completed", module: "Library", status: "success", timestamp: "12 min", detail: "380 itens sincronizados." },
  { id: "lg-003", title: "Spec to Budget running", module: "Budget", status: "running", timestamp: "Agora", detail: "18 itens em processamento." },
  { id: "lg-004", title: "Budget to Procurement waiting", module: "Procurement", status: "waiting", timestamp: "—", detail: "Aguardando aprovação do cliente." },
];

export const aiDataSyncInsights = [
  {
    title: "Definir contratos de dados antes de remover mocks",
    description: "Specification, Budget e Procurement precisam compartilhar IDs canônicos para produto, ambiente e fornecedor.",
    impact: "Crítico",
    action: "Criar schema comum",
  },
  {
    title: "Event Bus deve começar com eventos de aprovação",
    description: "Os eventos render.approved, specification.approved e budget.approved destravam o fluxo principal.",
    impact: "Alta prioridade",
    action: "Ativar tópicos principais",
  },
  {
    title: "Construction e Facility devem ficar por último",
    description: "Esses módulos dependem de Production e Procurement estabilizados.",
    impact: "Sequência segura",
    action: "Manter mock temporário",
  },
];
