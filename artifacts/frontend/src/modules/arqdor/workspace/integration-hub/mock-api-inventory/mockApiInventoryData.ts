import type { ApiInventoryItem, DataContractItem, InventoryChecklistItem, InventoryRisk, MigrationPriority, MockFileItem } from "./mockApiInventoryTypes";

export const mockFiles: MockFileItem[] = [
  {
    id: "mock-001",
    module: "Specification Studio",
    file: "specificationData.ts",
    path: "specification-studio/specificationData.ts",
    mockType: "static_array",
    status: "replace_next",
    priority: "critica",
    replacementApi: "/arch/specification/*",
    notes: "Baseia produtos, materiais, objetos e aprovações.",
  },
  {
    id: "mock-002",
    module: "Executive Budget",
    file: "budgetData.ts",
    path: "budget-studio/budgetData.ts",
    mockType: "static_array",
    status: "replace_next",
    priority: "critica",
    replacementApi: "/arch/orcamento/*",
    notes: "Deve receber itens da especificação.",
  },
  {
    id: "mock-003",
    module: "Procurement",
    file: "procurementData.ts",
    path: "procurement-studio/procurementData.ts",
    mockType: "static_array",
    status: "replace_next",
    priority: "alta",
    replacementApi: "/arch/procurement/*",
    notes: "Depende de orçamento aprovado e fornecedores.",
  },
  {
    id: "mock-004",
    module: "Marketplace",
    file: "marketplaceData.ts",
    path: "marketplace-enterprise/marketplaceData.ts",
    mockType: "static_array",
    status: "replace_next",
    priority: "alta",
    replacementApi: "/arch/marketplace/*",
    notes: "Fornecedor/produto precisa ID canônico.",
  },
  {
    id: "mock-005",
    module: "Client Experience",
    file: "clientExperienceData.ts",
    path: "client-experience/clientExperienceData.ts",
    mockType: "static_array",
    status: "replace_next",
    priority: "alta",
    replacementApi: "/arch/portal/:token",
    notes: "Portal deve consumir aprovações reais.",
  },
  {
    id: "mock-006",
    module: "BIM / Digital Twin",
    file: "bimData.ts",
    path: "bim-digital-twin/bimData.ts",
    mockType: "placeholder",
    status: "keep_temporarily",
    priority: "media",
    replacementApi: "/arch/bim/*",
    notes: "Pode permanecer mock até integração IFC real.",
  },
  {
    id: "mock-007",
    module: "Construction Hub",
    file: "constructionData.ts",
    path: "construction-hub/constructionData.ts",
    mockType: "static_array",
    status: "keep_temporarily",
    priority: "media",
    replacementApi: "/arch/construction/*",
    notes: "Depende de Production estável.",
  },
  {
    id: "mock-008",
    module: "Facility Management",
    file: "facilityData.ts",
    path: "facility-management/facilityData.ts",
    mockType: "static_array",
    status: "keep_temporarily",
    priority: "baixa",
    replacementApi: "/arch/facility/*",
    notes: "Conectar após Construction.",
  },
];

export const apiInventory: ApiInventoryItem[] = [
  { id: "api-001", module: "Project Studio", endpoint: "/arch/projetos", method: "MIXED", status: "ready", coverage: 95, owner: "Backend" },
  { id: "api-002", module: "Ambientes", endpoint: "/arch/projetos/:id/ambientes", method: "MIXED", status: "ready", coverage: 92, owner: "Backend" },
  { id: "api-003", module: "Catálogo", endpoint: "/arch/catalogo", method: "MIXED", status: "partial", coverage: 74, owner: "Backend" },
  { id: "api-004", module: "Orçamento", endpoint: "/arch/orcamento/*", method: "MIXED", status: "partial", coverage: 68, owner: "Backend" },
  { id: "api-005", module: "Marketplace", endpoint: "/arch/marketplace/*", method: "MIXED", status: "partial", coverage: 61, owner: "Backend" },
  { id: "api-006", module: "Portal", endpoint: "/arch/portal/:token", method: "GET", status: "ready", coverage: 82, owner: "Backend" },
  { id: "api-007", module: "Renders", endpoint: "/arch/renders/gallery", method: "GET", status: "partial", coverage: 70, owner: "Backend" },
  { id: "api-008", module: "Construction", endpoint: "/arch/construction/*", method: "MIXED", status: "missing", coverage: 0, owner: "Future" },
];

export const contracts: DataContractItem[] = [
  { id: "ct-001", entity: "project", canonicalId: "projectId", usedBy: ["Project", "Render", "Specification", "Client"], required: true, status: "defined" },
  { id: "ct-002", entity: "environment", canonicalId: "environmentId", usedBy: ["Project", "Specification", "Budget", "Construction"], required: true, status: "defined" },
  { id: "ct-003", entity: "product", canonicalId: "canonicalProductId", usedBy: ["Specification", "Budget", "Procurement", "Marketplace"], required: true, status: "missing" },
  { id: "ct-004", entity: "supplier", canonicalId: "supplierId/supplierTaxId", usedBy: ["Marketplace", "Procurement"], required: true, status: "review" },
  { id: "ct-005", entity: "approval", canonicalId: "approvalId", usedBy: ["Client", "Budget", "Procurement"], required: true, status: "review" },
  { id: "ct-006", entity: "asset", canonicalId: "facilityAssetId", usedBy: ["Construction", "IoT", "Facility"], required: false, status: "missing" },
];

export const migrationPriority: MigrationPriority[] = [
  { id: "mp-001", module: "Specification Studio", order: 1, reason: "Baseia orçamento, compras e marketplace.", dependency: "Catalog API + canonicalProductId", priority: "critica" },
  { id: "mp-002", module: "Executive Budget", order: 2, reason: "Libera aprovação cliente e procurement.", dependency: "Specification real", priority: "critica" },
  { id: "mp-003", module: "Client Experience", order: 3, reason: "Aprovação financeira destrava fluxo.", dependency: "Budget real", priority: "alta" },
  { id: "mp-004", module: "Procurement", order: 4, reason: "Transforma orçamento em compras reais.", dependency: "budget.approved event", priority: "alta" },
  { id: "mp-005", module: "Production", order: 5, reason: "Depende de compras e BIM.", dependency: "Procurement real", priority: "media" },
  { id: "mp-006", module: "Construction / Facility", order: 6, reason: "Pós-fluxo principal.", dependency: "Production estável", priority: "baixa" },
];

export const risks: InventoryRisk[] = [
  {
    id: "rk-001",
    title: "Produto sem ID canônico",
    module: "Specification / Budget / Procurement",
    risk: "critica",
    impact: "Duplicidade de itens, orçamento inconsistente e compras erradas.",
    mitigation: "Criar canonicalProductId antes da migração.",
  },
  {
    id: "rk-002",
    title: "Portal aprova mock, mas compras esperam dado real",
    module: "Client Experience / Procurement",
    risk: "alta",
    impact: "Handoff financeiro pode não destravar compra.",
    mitigation: "Criar contrato approvalId e evento budget.approved.",
  },
  {
    id: "rk-003",
    title: "Marketplace com fornecedor duplicado",
    module: "Marketplace / Procurement",
    risk: "alta",
    impact: "Cotação pode usar fornecedor duplicado ou incorreto.",
    mitigation: "Normalizar supplierTaxId.",
  },
  {
    id: "rk-004",
    title: "BIM ainda placeholder",
    module: "BIM",
    risk: "media",
    impact: "Produção não deve depender de clash real ainda.",
    mitigation: "Manter BIM informativo até IFC real.",
  },
];

export const checklist: InventoryChecklistItem[] = [
  { id: "ck-001", title: "Listar todos os arquivos *Data.ts", category: "Inventário", checked: true, owner: "Frontend" },
  { id: "ck-002", title: "Validar APIs existentes", category: "Backend", checked: true, owner: "Tech" },
  { id: "ck-003", title: "Definir canonicalProductId", category: "Schema", checked: false, owner: "Produto/Tech" },
  { id: "ck-004", title: "Definir approvalId", category: "Schema", checked: false, owner: "Tech" },
  { id: "ck-005", title: "Criar sequência 19B–19J", category: "Planejamento", checked: true, owner: "Produto" },
  { id: "ck-006", title: "Confirmar rotas reais antes de remover mock", category: "QA", checked: false, owner: "QA" },
];

export const aiInventoryInsights = [
  {
    title: "Começar por Specification e Budget",
    description: "Esses módulos são o centro do fluxo operacional e destravam compras, cliente e produção.",
    impact: "Prioridade crítica",
    action: "Preparar Sprint 019B",
  },
  {
    title: "Não conectar Construction antes de Production",
    description: "Obra e Facility dependem de pedidos, produção e entregas reais.",
    impact: "Sequência segura",
    action: "Manter temporário",
  },
  {
    title: "Contratos são mais importantes que telas",
    description: "projectId, environmentId, canonicalProductId, supplierId e approvalId devem virar padrão.",
    impact: "Governança",
    action: "Definir contratos",
  },
];
