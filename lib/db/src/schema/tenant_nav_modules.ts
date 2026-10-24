import { pgTable, text, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const NAV_MODULE_KEYS = [
  "dashboard",
  "leads",
  "sdr",
  "prospector",
  "content",
  "campaigns",
  "scheduler",
  "revenue",
  "churn",
  "analytics",
  "arch",
  "obras",
  "financeiro",
  "settings",
  // Seções por vertical — já existiam como dados reais no banco (gravados
  // antes dessas chaves estarem no catálogo), agora reconhecidas de verdade
  "varejo",
  "supermercado",
  "beauty",
  "clinic",
  // Ferramentas de inteligência do próprio Vendor.ai — antes visíveis pra
  // todo mundo sem nenhum toggle (seção "inteligencia" é sempre exibida)
  "knowledge_graph",
  "vendor_brain",
  // Add-on pago: pesquisa/geração/publicação automática de conteúdo SEO
  "content_autopilot",
  // Ecossistema Praça.AI — fica oculto por padrão e só o Super Admin libera
  // por tenant. Inclui Stories, Variedades e módulos operacionais/logísticos.
  "praca_ai",
  "vendi_studio",
] as const;

export type NavModuleKey = (typeof NAV_MODULE_KEYS)[number];

export interface NavModuleCatalogEntry {
  moduleKey: NavModuleKey;
  moduleName: string;
  icon: string;
  description: string;
  isDefault: boolean;
}

export const NAV_MODULE_CATALOG: NavModuleCatalogEntry[] = [
  { moduleKey: "dashboard",   moduleName: "Dashboard",       icon: "LayoutDashboard", description: "Visão geral do negócio",           isDefault: true  },
  { moduleKey: "leads",       moduleName: "Leads",           icon: "Users",           description: "Gestão de leads e contatos",        isDefault: true  },
  { moduleKey: "sdr",         moduleName: "SDR",             icon: "Bot",             description: "Atendimento e qualificação",         isDefault: true  },
  { moduleKey: "prospector",  moduleName: "Prospector",      icon: "Search",          description: "Busca ativa de leads",              isDefault: false },
  { moduleKey: "content",     moduleName: "Conteúdo",        icon: "FileText",        description: "Nutrição e fluxos de conteúdo",     isDefault: false },
  { moduleKey: "campaigns",   moduleName: "Campanhas",       icon: "Megaphone",       description: "Disparo em lote",                   isDefault: false },
  { moduleKey: "scheduler",   moduleName: "Agendamentos",    icon: "Calendar",        description: "Reuniões e lembretes",              isDefault: true  },
  { moduleKey: "revenue",     moduleName: "Receita",         icon: "DollarSign",      description: "Oportunidades preditivas",          isDefault: false },
  { moduleKey: "churn",       moduleName: "Churn",           icon: "AlertCircle",     description: "Prevenção de cancelamento",         isDefault: false },
  { moduleKey: "analytics",   moduleName: "Análises",        icon: "BarChart2",       description: "Relatórios e inteligência",         isDefault: false },
  { moduleKey: "arch",        moduleName: "Arqdor.ai",       icon: "Compass",         description: "Projetos, arquitetura, interiores, renderização e obra", isDefault: false },
  { moduleKey: "obras",       moduleName: "Obras",           icon: "HardHat",         description: "Gestão de obras e projetos",        isDefault: false },
  { moduleKey: "financeiro",  moduleName: "Gestão ERP",      icon: "WalletCards",     description: "ERP financeiro e operacional — add-on R$ 299/mês", isDefault: false },
  { moduleKey: "settings",    moduleName: "Configurações",   icon: "Settings",        description: "Configurações do sistema",          isDefault: true  },
  { moduleKey: "varejo",       moduleName: "Varejo",         icon: "ShoppingBag",     description: "Produtos, coleções e compras (seção Varejo)", isDefault: true },
  { moduleKey: "supermercado", moduleName: "Supermercado",   icon: "ShoppingCart",    description: "Produtos, pedidos e campanhas de mercado",     isDefault: true },
  { moduleKey: "beauty",       moduleName: "Salão",          icon: "Scissors",        description: "Agenda, serviços e profissionais do salão",    isDefault: true },
  { moduleKey: "clinic",       moduleName: "Clínica",        icon: "Stethoscope",     description: "Agenda e médicos da clínica",                   isDefault: true },
  { moduleKey: "knowledge_graph", moduleName: "Knowledge Graph", icon: "Network",     description: "Mapa de conhecimento e relações do negócio",   isDefault: true },
  { moduleKey: "vendor_brain",    moduleName: "Vendor Brain",    icon: "BrainCircuit", description: "Central de inteligência de IA sobre o negócio", isDefault: true },
  { moduleKey: "content_autopilot", moduleName: "Content Autopilot", icon: "Sparkles", description: "Pesquisa, gera e publica conteúdo SEO automaticamente", isDefault: false },
  { moduleKey: "vendi_studio", moduleName: "Vendi Studio", icon: "Code2", description: "Criação de aplicativos e produtos digitais com IA", isDefault: false },
  { moduleKey: "praca_ai", moduleName: "Praça.AI", icon: "Store", description: "Stories, Variedades e módulos operacionais, logísticos e executivos do Praça.AI", isDefault: false },
];

export const tenantNavModulesTable = pgTable(
  "tenant_nav_modules",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    moduleKey: text("module_key").$type<NavModuleKey>().notNull(),
    isEnabled: boolean("is_enabled").notNull().default(true),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("tenant_nav_modules_tenant_key_uidx").on(table.tenantId, table.moduleKey),
  ]
);

export const insertTenantNavModuleSchema = createInsertSchema(tenantNavModulesTable).omit({
  id: true,
  updatedAt: true,
});

export type InsertTenantNavModule = z.infer<typeof insertTenantNavModuleSchema>;
export type TenantNavModule = typeof tenantNavModulesTable.$inferSelect;
