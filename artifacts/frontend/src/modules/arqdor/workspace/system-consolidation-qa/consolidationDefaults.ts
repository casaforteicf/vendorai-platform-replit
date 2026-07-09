import type { MockDebtItem, ReleaseGate, TenantSecurityCheck } from "./consolidationTypes";

export const DEFAULT_RELEASE_GATES: ReleaseGate[] = [
  {
    id: "gate-typecheck",
    label: "Typecheck global",
    description: "pnpm typecheck executado após aplicação das sprints 029–034.",
    status: "pending",
    owner: "Replit Agent",
  },
  {
    id: "gate-navigation",
    label: "Navegação unificada",
    description: "Menu lateral e rotas levam ao fluxo completo sem telas órfãs.",
    status: "pending",
    owner: "Frontend",
  },
  {
    id: "gate-real-api",
    label: "APIs reais",
    description: "Fluxo principal usa endpoints reais sem mock silencioso.",
    status: "pending",
    owner: "Backend",
  },
  {
    id: "gate-tenant",
    label: "Tenant/RLS",
    description: "Todas as tabelas novas respeitam tenant_id e isolamento.",
    status: "pending",
    owner: "Backend",
  },
  {
    id: "gate-public-token",
    label: "Tokens públicos seguros",
    description: "Portal de proposta e termos públicos validam token e não vazam dados.",
    status: "pending",
    owner: "Security",
  },
  {
    id: "gate-print",
    label: "Impressão orçamento",
    description: "Impressão mostra todos os itens, material e mão de obra.",
    status: "pending",
    owner: "QA",
  },
  {
    id: "gate-release-candidate",
    label: "Release Candidate",
    description: "Fluxo E2E validado: render → pós-venda.",
    status: "pending",
    owner: "Produto",
  },
];

export const DEFAULT_SECURITY_CHECKS: TenantSecurityCheck[] = [
  {
    id: "sec-tenant-id",
    label: "tenant_id em tabelas críticas",
    description: "arch_spec_objects, arch_budgets, arch_proposals, arch_work_orders e arch_deliveries possuem tenant_id.",
    status: "pending",
    risk: "critical",
  },
  {
    id: "sec-rls",
    label: "RLS / filtro por tenant",
    description: "Queries de listagem e mutação filtram pelo tenant autenticado.",
    status: "pending",
    risk: "critical",
  },
  {
    id: "sec-public-token",
    label: "Rotas públicas por token",
    description: "Rotas públicas expõem somente proposta/termo do token informado.",
    status: "pending",
    risk: "high",
  },
  {
    id: "sec-write-permission",
    label: "Permissão de escrita",
    description: "Apenas usuários do tenant podem alterar orçamento, produção e pós-venda.",
    status: "pending",
    risk: "high",
  },
];

export const DEFAULT_MOCK_DEBTS: MockDebtItem[] = [
  {
    id: "mock-render-history",
    moduleId: "render-gallery",
    filePath: "RenderHistoryModule / MOCK_RENDERS",
    description: "Histórico antigo ainda pode estar usando mocks em telas legadas.",
    severity: "critical",
    recommendation: "Substituir pelo RealRenderGalleryStudio ou pelo hook real da Sprint 029.",
    status: "open",
  },
  {
    id: "mock-catalog",
    moduleId: "specification-catalog",
    filePath: "LibraryModule / SpecificationStudio",
    description: "Catálogo e produtos antigos podem estar mockados.",
    severity: "high",
    recommendation: "Usar /arch/catalogo e /arch/spec-objects da Sprint 030.",
    status: "open",
  },
  {
    id: "mock-budget-print",
    moduleId: "budget-engine",
    filePath: "Orçamento antigo / impressão",
    description: "Impressão antiga pode omitir atividades/itens.",
    severity: "high",
    recommendation: "Centralizar impressão no BudgetPrintPreview da Sprint 031.",
    status: "open",
  },
  {
    id: "mock-portal",
    moduleId: "client-portal-approval",
    filePath: "PortalCliente.tsx",
    description: "Portal cliente antigo pode não ler proposta pública por token.",
    severity: "high",
    recommendation: "Integrar PublicProposalPortal da Sprint 032.",
    status: "open",
  },
];
