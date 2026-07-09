import type { AuditTrace, MigrationChecklistItem, MigrationItem, MigrationTimelineEvent, MockInventoryItem, RollbackPlan, TraceLink } from "./migrationTypes";

export const migrations: MigrationItem[] = [
  {
    id: "mg-001",
    module: "Project Studio",
    title: "Consolidar projeto e ambientes",
    from: "Estado local + APIs existentes",
    to: "/arch/projetos + /arch/projetos/:id/ambientes",
    status: "completed",
    progress: 94,
    owner: "Frontend",
  },
  {
    id: "mg-002",
    module: "Specification Studio",
    title: "Migrar objetos e especificações",
    from: "Mock specificationData",
    to: "Specification API + catalog canonical IDs",
    status: "planned",
    progress: 36,
    owner: "Produto / Tech",
    blocker: "Definir canonicalProductId",
  },
  {
    id: "mg-003",
    module: "Budget",
    title: "Migrar orçamento executivo",
    from: "Mock budgetData",
    to: "/arch/orcamento/*",
    status: "planned",
    progress: 42,
    owner: "Tech",
  },
  {
    id: "mg-004",
    module: "Procurement",
    title: "Migrar compras e recebimento",
    from: "Mock procurement data",
    to: "Procurement API + Marketplace API",
    status: "blocked",
    progress: 18,
    owner: "Tech",
    blocker: "Aguardar budget.approved event",
  },
  {
    id: "mg-005",
    module: "Construction / Facility",
    title: "Manter mock temporário",
    from: "Mock construction/facility",
    to: "APIs futuras",
    status: "not_started",
    progress: 0,
    owner: "Produto",
    blocker: "Depende de Production estável",
  },
];

export const mockInventory: MockInventoryItem[] = [
  { id: "mk-001", module: "Specification", file: "specificationData.ts", mockType: "static_data", replacementApi: "/arch/specification/*", risk: "alto", status: "planned" },
  { id: "mk-002", module: "Budget", file: "budgetData.ts", mockType: "static_data", replacementApi: "/arch/orcamento/*", risk: "alto", status: "planned" },
  { id: "mk-003", module: "Procurement", file: "procurementData.ts", mockType: "static_data", replacementApi: "/arch/procurement/*", risk: "critico", status: "blocked" },
  { id: "mk-004", module: "BIM", file: "bimData.ts", mockType: "placeholder", replacementApi: "/arch/bim/*", risk: "medio", status: "not_started" },
  { id: "mk-005", module: "Construction", file: "constructionData.ts", mockType: "static_data", replacementApi: "/arch/construction/*", risk: "medio", status: "not_started" },
  { id: "mk-006", module: "Facility", file: "facilityData.ts", mockType: "static_data", replacementApi: "/arch/facility/*", risk: "baixo", status: "not_started" },
];

export const auditTraces: AuditTrace[] = [
  {
    id: "au-001",
    title: "Migration plan created",
    module: "Integration Hub",
    actor: "AI Integration",
    severity: "info",
    timestamp: "Hoje 11:00",
    details: "Plano de migração mock → APIs reais criado.",
  },
  {
    id: "au-002",
    title: "canonicalProductId missing",
    module: "Specification / Budget",
    actor: "Data Sync",
    severity: "high",
    timestamp: "Hoje 11:08",
    details: "Produto sem ID canônico impede sincronização confiável.",
  },
  {
    id: "au-003",
    title: "Procurement migration blocked",
    module: "Procurement",
    actor: "Migration Center",
    severity: "critical",
    timestamp: "Hoje 11:15",
    details: "Migração depende do evento budget.approved.",
  },
  {
    id: "au-004",
    title: "Project API validated",
    module: "Project Studio",
    actor: "Health Monitor",
    severity: "info",
    timestamp: "Hoje 11:21",
    details: "Fonte de projetos validada como API real.",
  },
];

export const traceLinks: TraceLink[] = [
  { id: "tr-001", entity: "project", origin: "Project Studio", destination: "Render / Specification", traceId: "projectId", status: "valid" },
  { id: "tr-002", entity: "environment", origin: "Project Studio", destination: "Budget / Construction", traceId: "environmentId", status: "partial" },
  { id: "tr-003", entity: "product", origin: "Specification", destination: "Budget / Procurement", traceId: "canonicalProductId", status: "broken" },
  { id: "tr-004", entity: "supplier", origin: "Marketplace", destination: "Procurement", traceId: "supplierTaxId", status: "partial" },
  { id: "tr-005", entity: "asset", origin: "Construction", destination: "Facility", traceId: "facilityAssetId", status: "broken" },
];

export const timelineEvents: MigrationTimelineEvent[] = [
  { id: "tl-001", date: "Dia 1", title: "Inventário de mocks", description: "Mapear todos os arquivos com dados simulados.", status: "completed" },
  { id: "tl-002", date: "Dia 2", title: "Contratos canônicos", description: "Definir IDs únicos para projeto, ambiente, produto, fornecedor e ativo.", status: "planned" },
  { id: "tl-003", date: "Dia 3", title: "Migrar Specification + Budget", description: "Substituir mocks principais por APIs/contratos reais.", status: "planned" },
  { id: "tl-004", date: "Dia 4", title: "Ativar Budget → Procurement", description: "Criar evento budget.approved e liberar compras.", status: "blocked" },
  { id: "tl-005", date: "Dia 5", title: "Validação ponta a ponta", description: "Testar Project → Render → Specification → Budget → Procurement.", status: "planned" },
];

export const rollbackPlans: RollbackPlan[] = [
  { id: "rb-001", module: "Specification", trigger: "API retorna erro ou schema inválido", action: "Fallback para último snapshot local", owner: "Tech", status: "ready" },
  { id: "rb-002", module: "Budget", trigger: "Cálculo divergente", action: "Usar orçamento salvo e travar geração de pedido", owner: "Financeiro / Tech", status: "ready" },
  { id: "rb-003", module: "Procurement", trigger: "Pedido gerado com dados incompletos", action: "Cancelar requisição e exigir aprovação manual", owner: "Compras", status: "draft" },
  { id: "rb-004", module: "Construction", trigger: "API indisponível", action: "Manter módulo em modo mock/read-only", owner: "Produto", status: "ready" },
];

export const checklist: MigrationChecklistItem[] = [
  { id: "ck-001", title: "Mapear todos os arquivos *Data.ts", category: "Mock Inventory", checked: true, owner: "Tech" },
  { id: "ck-002", title: "Definir canonicalProductId", category: "Schema", checked: false, owner: "Produto / Tech" },
  { id: "ck-003", title: "Definir environmentId global", category: "Schema", checked: true, owner: "Tech" },
  { id: "ck-004", title: "Criar evento budget.approved", category: "Event Bus", checked: false, owner: "Backend" },
  { id: "ck-005", title: "Validar fluxo Project → Procurement", category: "QA", checked: false, owner: "QA" },
  { id: "ck-006", title: "Registrar rollback por módulo", category: "Governança", checked: true, owner: "Tech" },
];

export const aiMigrationInsights = [
  {
    title: "Não migre tudo de uma vez",
    description: "A sequência segura é Specification + Budget primeiro, depois Procurement, depois Production e só então Construction/Facility.",
    impact: "Reduz risco",
    action: "Seguir ordem segura",
  },
  {
    title: "canonicalProductId é obrigatório",
    description: "Sem ID canônico, orçamento, compras e marketplace podem duplicar itens.",
    impact: "Crítico",
    action: "Criar contrato",
  },
  {
    title: "Rollback precisa existir antes da troca real",
    description: "Cada módulo migrado deve ter fallback para evitar quebrar a operação.",
    impact: "Governança",
    action: "Validar rollback",
  },
];
