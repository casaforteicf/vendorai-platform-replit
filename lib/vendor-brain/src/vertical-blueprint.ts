import type { AgentId, ChannelId, ModuleId, SkillId } from "./platform-foundation";

export interface VerticalNavigationItem {
  id: string;
  label: string;
  route: string;
  moduleId: ModuleId;
  order: number;
  permission?: string;
}

export interface VerticalKpiDefinition {
  id: string;
  label: string;
  source: string;
  format?: "number" | "currency" | "percent" | "duration";
  goalDirection?: "up" | "down" | "neutral";
}

export interface VerticalMarketingBlueprint {
  objectives: string[];
  priorities: string[];
  recommendedChannels: ChannelId[];
  campaignTypes: string[];
  contentPillars: string[];
  skillIds: SkillId[];
}

export interface VerticalIntelligenceBlueprint {
  signals: string[];
  opportunities: string[];
  nextBestActions: string[];
}

export interface VerticalBlueprint {
  id: string;
  name: string;
  version: number;
  description?: string;
  moduleIds: ModuleId[];
  optionalModuleIds?: ModuleId[];
  navigation: VerticalNavigationItem[];
  agentIds: AgentId[];
  skillIds: SkillId[];
  kpis: VerticalKpiDefinition[];
  marketing: VerticalMarketingBlueprint;
  intelligence: VerticalIntelligenceBlueprint;
}

export function defineVerticalBlueprint<T extends VerticalBlueprint>(blueprint: T): T {
  return blueprint;
}

export function mergeVerticalBlueprint(
  base: VerticalBlueprint,
  overrides: Partial<VerticalBlueprint>,
): VerticalBlueprint {
  return {
    ...base,
    ...overrides,
    moduleIds: overrides.moduleIds ?? base.moduleIds,
    optionalModuleIds: overrides.optionalModuleIds ?? base.optionalModuleIds,
    navigation: overrides.navigation ?? base.navigation,
    agentIds: overrides.agentIds ?? base.agentIds,
    skillIds: overrides.skillIds ?? base.skillIds,
    kpis: overrides.kpis ?? base.kpis,
    marketing: { ...base.marketing, ...(overrides.marketing ?? {}) },
    intelligence: { ...base.intelligence, ...(overrides.intelligence ?? {}) },
  };
}

export const DISTRIBUTOR_BLUEPRINT = defineVerticalBlueprint({
  id: "distributor",
  name: "Distribuidora",
  version: 1,
  description: "Operação comercial e de distribuição orientada por carteira, recorrência, produto, vendedor e território.",
  moduleIds: ["crm", "contacts", "conversations", "catalog", "orders", "stock", "routes", "commission", "finance", "marketing", "media", "website", "automation", "ai"],
  optionalModuleIds: ["portal", "service"],
  navigation: [
    { id: "dashboard", label: "Dashboard", route: "/", moduleId: "crm", order: 10 },
    { id: "crm", label: "CRM", route: "/crm", moduleId: "crm", order: 20 },
    { id: "clientes", label: "Clientes", route: "/clientes", moduleId: "contacts", order: 30 },
    { id: "catalogo", label: "Catálogo", route: "/catalogo", moduleId: "catalog", order: 40 },
    { id: "pedidos", label: "Pedidos", route: "/pedidos", moduleId: "orders", order: 50 },
    { id: "estoque", label: "Estoque", route: "/estoque", moduleId: "stock", order: 60 },
    { id: "rotas", label: "Rotas", route: "/rotas", moduleId: "routes", order: 70 },
    { id: "comissoes", label: "Comissões", route: "/comissoes", moduleId: "commission", order: 80 },
    { id: "marketing", label: "Marketing", route: "/marketing", moduleId: "marketing", order: 90 },
    { id: "financeiro", label: "Financeiro", route: "/financeiro", moduleId: "finance", order: 100 },
  ],
  agentIds: ["sales", "marketing", "finance", "support", "operations", "follow-up"],
  skillIds: ["marketing.strategy", "marketing.campaign-planning", "marketing.audience-intelligence", "marketing.crm-marketing", "marketing.copywriting", "creative.direction", "creative.design-review", "creative.brand-guardian", "marketing.analytics", "marketing.experimentation", "channel.meta-ads", "channel.instagram-organic", "channel.google-search", "channel.google-pmax", "channel.whatsapp", "channel.email"],
  kpis: [
    { id: "revenue", label: "Faturamento", source: "sales", format: "currency", goalDirection: "up" },
    { id: "avg-ticket", label: "Ticket médio", source: "sales", format: "currency", goalDirection: "up" },
    { id: "repurchase", label: "Recompra", source: "revenue-scout", format: "percent", goalDirection: "up" },
    { id: "inactive-customers", label: "Clientes inativos", source: "revenue-scout", format: "number", goalDirection: "down" },
    { id: "margin", label: "Margem", source: "orders", format: "percent", goalDirection: "up" },
  ],
  marketing: {
    objectives: ["gerar receita", "aumentar recompra", "reativar carteira", "acelerar cross-sell"],
    priorities: ["recompra", "cross-sell", "clientes inativos", "produto parado", "região", "campanhas para vendedores"],
    recommendedChannels: ["meta", "instagram", "google-search", "google-pmax", "whatsapp", "email"],
    campaignTypes: ["recompra", "reativação", "cross-sell", "lançamento", "queima de estoque", "regional"],
    contentPillars: ["produto", "aplicação", "benefício", "prova", "novidade", "oferta"],
    skillIds: ["marketing.strategy", "marketing.campaign-planning", "marketing.crm-marketing", "marketing.copywriting", "creative.direction", "marketing.analytics"],
  },
  intelligence: {
    signals: ["customer.repurchase_window", "customer.inactive", "product.stock_excess", "region.sales_growth", "seller.performance_drop", "margin.drop"],
    opportunities: ["repurchase", "reactivation", "cross-sell", "regional-growth", "inventory-activation"],
    nextBestActions: ["create-campaign", "create-seller-task", "prepare-whatsapp-reactivation", "recommend-cross-sell"],
  },
});

export const CONSTRUCTION_BLUEPRINT = defineVerticalBlueprint({
  id: "construction",
  name: "Construtora",
  version: 1,
  description: "Operação comercial e de obra com projetos, etapas, compras, documentos, assistência e geração de demanda.",
  moduleIds: ["crm", "contacts", "conversations", "catalog", "orders", "projects", "service", "finance", "marketing", "media", "website", "automation", "ai"],
  optionalModuleIds: ["stock", "portal"],
  navigation: [
    { id: "dashboard", label: "Dashboard", route: "/", moduleId: "crm", order: 10 },
    { id: "crm", label: "CRM", route: "/crm", moduleId: "crm", order: 20 },
    { id: "projetos", label: "Projetos", route: "/projetos", moduleId: "projects", order: 30 },
    { id: "obras", label: "Obras", route: "/obras", moduleId: "projects", order: 40 },
    { id: "orcamentos", label: "Orçamentos", route: "/orcamentos", moduleId: "orders", order: 50 },
    { id: "assistencia", label: "Assistência", route: "/assistencia", moduleId: "service", order: 60 },
    { id: "marketing", label: "Marketing", route: "/marketing", moduleId: "marketing", order: 70 },
    { id: "financeiro", label: "Financeiro", route: "/financeiro", moduleId: "finance", order: 80 },
  ],
  agentIds: ["sales", "marketing", "finance", "support", "operations", "follow-up"],
  skillIds: ["marketing.strategy", "marketing.campaign-planning", "marketing.audience-intelligence", "marketing.copywriting", "creative.direction", "creative.design-review", "creative.brand-guardian", "creative.video-strategy", "creative.video-script", "marketing.analytics", "channel.meta-ads", "channel.instagram-organic", "channel.google-search", "channel.google-pmax", "channel.youtube", "channel.whatsapp"],
  kpis: [
    { id: "pipeline-value", label: "Pipeline", source: "crm", format: "currency", goalDirection: "up" },
    { id: "projects-active", label: "Obras ativas", source: "projects", format: "number", goalDirection: "neutral" },
    { id: "project-delay", label: "Atraso médio", source: "projects", format: "duration", goalDirection: "down" },
    { id: "gross-margin", label: "Margem", source: "finance", format: "percent", goalDirection: "up" },
  ],
  marketing: {
    objectives: ["gerar demanda", "aumentar autoridade", "converter orçamento", "ampliar presença regional"],
    priorities: ["obras reais", "projetos", "processo construtivo", "cases", "região", "prova social"],
    recommendedChannels: ["meta", "instagram", "google-search", "google-pmax", "youtube", "whatsapp"],
    campaignTypes: ["geração de leads", "modelo de casa", "obra real", "conteúdo técnico", "regional", "remarketing"],
    contentPillars: ["obra", "projeto", "benefício", "processo", "prova", "educação"],
    skillIds: ["marketing.strategy", "marketing.campaign-planning", "marketing.copywriting", "creative.direction", "creative.video-strategy", "creative.video-script", "marketing.analytics"],
  },
  intelligence: {
    signals: ["lead.stalled", "proposal.stalled", "region.lead-growth", "campaign.performance_drop", "project.delay"],
    opportunities: ["lead-reactivation", "regional-demand", "remarketing", "authority-content"],
    nextBestActions: ["create-campaign", "prepare-content", "create-follow-up", "create-landing-page"],
  },
});

export const VERTICAL_BLUEPRINT_REGISTRY: Record<string, VerticalBlueprint> = {
  [DISTRIBUTOR_BLUEPRINT.id]: DISTRIBUTOR_BLUEPRINT,
  [CONSTRUCTION_BLUEPRINT.id]: CONSTRUCTION_BLUEPRINT,
};

export function getVerticalBlueprint(id: string): VerticalBlueprint | undefined {
  return VERTICAL_BLUEPRINT_REGISTRY[id];
}
