import { boolean, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export interface ContentAutopilotBrandTone {
  tom: string;
  vocabulario?: string[];
  publicoAlvo?: string;
  exemplos?: string[];
}

export const CONTENT_AUTOPILOT_CANAIS = ["wordpress", "site_proprio", "praca_ai"] as const;
export type ContentAutopilotCanal = (typeof CONTENT_AUTOPILOT_CANAIS)[number];

export const contentAutopilotConfigTable = pgTable("content_autopilot_config", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  siteUrl: text("site_url"),
  brandTone: jsonb("brand_tone").$type<ContentAutopilotBrandTone>(),
  canalPublicacao: text("canal_publicacao").$type<ContentAutopilotCanal>().notNull().default("wordpress"),
  wpUrl: text("wp_url"),
  wpAppUser: text("wp_app_user"),
  wpAppPassword: text("wp_app_password"),
  idiomas: jsonb("idiomas").$type<string[]>().notNull().default(["pt-BR"]),
  artigosPorDia: integer("artigos_por_dia").notNull().default(1),
  tetoGastoMensal: numeric("teto_gasto_mensal", { precision: 10, scale: 2 }),
  gastoAcumulado: numeric("gasto_acumulado", { precision: 10, scale: 4 }).notNull().default("0"),
  ativo: boolean("ativo").notNull().default(false),
  ultimaAnaliseSiteEm: timestamp("ultima_analise_site_em"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("content_autopilot_config_tenant_unique").on(table.tenantId),
]);

export const CONTENT_AUTOPILOT_KEYWORD_TIPOS = ["generico", "especifico", "intencao_compra"] as const;
export type ContentAutopilotKeywordTipo = (typeof CONTENT_AUTOPILOT_KEYWORD_TIPOS)[number];

export const CONTENT_AUTOPILOT_KEYWORD_STATUS = ["descoberta", "aprovada", "em_uso", "descartada"] as const;
export type ContentAutopilotKeywordStatus = (typeof CONTENT_AUTOPILOT_KEYWORD_STATUS)[number];

export const contentAutopilotKeywordsTable = pgTable("content_autopilot_keywords", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  termo: text("termo").notNull(),
  volumeBusca: integer("volume_busca"),
  dificuldade: numeric("dificuldade", { precision: 5, scale: 2 }),
  tipo: text("tipo").$type<ContentAutopilotKeywordTipo>(),
  status: text("status").$type<ContentAutopilotKeywordStatus>().notNull().default("descoberta"),
  fonte: text("fonte").notNull().default("dataforseo"),
  serpTop10: jsonb("serp_top10").$type<{ position: number | null; title: string; url: string; domain: string; description: string | null }[]>(),
  serpColetadoEm: timestamp("serp_coletado_em"),
  coletadoEm: timestamp("coletado_em").notNull().defaultNow(),
}, (table) => [
  index("content_autopilot_keywords_tenant_status_idx").on(table.tenantId, table.status),
  uniqueIndex("content_autopilot_keywords_tenant_termo_unique").on(table.tenantId, table.termo),
]);

export const CONTENT_AUTOPILOT_ARTICLE_STATUS = [
  "pesquisando",
  "gerando",
  "otimizando",
  "pronto_revisao",
  "publicado",
  "erro",
] as const;
export type ContentAutopilotArticleStatus = (typeof CONTENT_AUTOPILOT_ARTICLE_STATUS)[number];

export const CONTENT_AUTOPILOT_WP_STATUS = ["draft", "publish"] as const;
export type ContentAutopilotWpStatus = (typeof CONTENT_AUTOPILOT_WP_STATUS)[number];

export interface ContentAutopilotImage {
  url: string;
  altText: string;
}

export interface ContentAutopilotLink {
  url: string;
  anchorText: string;
}

export interface ContentAutopilotSeoChecklist {
  tituloOk: boolean;
  metaDescriptionOk: boolean;
  densidadeKeywordOk: boolean;
  headersOk: boolean;
  tamanhoMinimoOk: boolean;
  legibilidadeOk: boolean;
}

export const contentAutopilotArticlesTable = pgTable("content_autopilot_articles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  keywordId: text("keyword_id").references(() => contentAutopilotKeywordsTable.id, { onDelete: "set null" }),
  titulo: text("titulo"),
  slug: text("slug"),
  conteudoMd: text("conteudo_md"),
  metaDescription: text("meta_description"),
  imagens: jsonb("imagens").$type<ContentAutopilotImage[]>().notNull().default([]),
  linksInternos: jsonb("links_internos").$type<ContentAutopilotLink[]>().notNull().default([]),
  linksExternos: jsonb("links_externos").$type<ContentAutopilotLink[]>().notNull().default([]),
  seoScore: integer("seo_score"),
  seoChecklist: jsonb("seo_checklist").$type<ContentAutopilotSeoChecklist>(),
  wpPostId: text("wp_post_id"),
  wpStatus: text("wp_status").$type<ContentAutopilotWpStatus>(),
  status: text("status").$type<ContentAutopilotArticleStatus>().notNull().default("pesquisando"),
  custoGerado: numeric("custo_gerado", { precision: 10, scale: 4 }).notNull().default("0"),
  erroDetalhe: text("erro_detalhe"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  publicadoEm: timestamp("publicado_em"),
}, (table) => [
  index("content_autopilot_articles_tenant_status_idx").on(table.tenantId, table.status),
]);

export const contentAutopilotRunsTable = pgTable("content_autopilot_runs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  iniciadoEm: timestamp("iniciado_em").notNull().defaultNow(),
  finalizadoEm: timestamp("finalizado_em"),
  artigosGerados: integer("artigos_gerados").notNull().default(0),
  erros: jsonb("erros").$type<string[]>().notNull().default([]),
  custoTotal: numeric("custo_total", { precision: 10, scale: 4 }).notNull().default("0"),
}, (table) => [
  index("content_autopilot_runs_tenant_iniciado_idx").on(table.tenantId, table.iniciadoEm),
]);

export const insertContentAutopilotConfigSchema = createInsertSchema(contentAutopilotConfigTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const updateContentAutopilotConfigSchema = createSelectSchema(contentAutopilotConfigTable)
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();
export const insertContentAutopilotKeywordSchema = createInsertSchema(contentAutopilotKeywordsTable).omit({
  id: true,
  coletadoEm: true,
});
export const insertContentAutopilotArticleSchema = createInsertSchema(contentAutopilotArticlesTable).omit({
  id: true,
  createdAt: true,
});
export const insertContentAutopilotRunSchema = createInsertSchema(contentAutopilotRunsTable).omit({
  id: true,
  iniciadoEm: true,
});

export type InsertContentAutopilotConfig = z.infer<typeof insertContentAutopilotConfigSchema>;
export type UpdateContentAutopilotConfig = z.infer<typeof updateContentAutopilotConfigSchema>;
export type ContentAutopilotConfig = typeof contentAutopilotConfigTable.$inferSelect;
export type InsertContentAutopilotKeyword = z.infer<typeof insertContentAutopilotKeywordSchema>;
export type ContentAutopilotKeyword = typeof contentAutopilotKeywordsTable.$inferSelect;
export type InsertContentAutopilotArticle = z.infer<typeof insertContentAutopilotArticleSchema>;
export type ContentAutopilotArticle = typeof contentAutopilotArticlesTable.$inferSelect;
export type InsertContentAutopilotRun = z.infer<typeof insertContentAutopilotRunSchema>;
export type ContentAutopilotRun = typeof contentAutopilotRunsTable.$inferSelect;
