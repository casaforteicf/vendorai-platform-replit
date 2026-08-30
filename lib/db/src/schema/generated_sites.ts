import { pgTable, text, timestamp, jsonb, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export interface SiteGeneratorProduct {
  name: string;
  price: string;
  description?: string;
  imageUrl?: string;
  sku?: string;
  inStock?: boolean;
  stockQty?: number;
  featured?: boolean;
  marca?: string;
  tags?: string[];
}

export interface SiteGeneratorConfig {
  type: "landing" | "ecommerce" | "institutional";
  name: string;
  sector?: string;
  desc: string;
  pain?: string;
  tone: string;
  cta?: string;
  color: string;
  logoUrl?: string;
  products?: SiteGeneratorProduct[];
  whatsapp?: string;
  instagram?: string;
  images?: string[];
  // Título/H1 sugerido pelo lojista para esta página específica (usado no
  // fluxo de gerar várias LPs de uma vez, uma por nicho/produto/serviço) —
  // quando ausente, a IA escreve o headline como sempre fez.
  headline?: string;
  // URLs de vídeo — link do YouTube/Vimeo (embutido via iframe) ou URL
  // direta de arquivo .mp4 (embutido via <video>). O site guarda só a
  // URL, sem upload/hospedagem própria de vídeo.
  videos?: string[];
  servicos?: string;
}

export interface SiteSeoChecklist {
  tituloOk: boolean;
  metaDescriptionOk: boolean;
  headersOk: boolean;
  tamanhoMinimoOk: boolean;
  legibilidadeOk: boolean;
  imagensAltOk: boolean;
}

export const generatedSitesTable = pgTable("generated_sites", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  siteType: text("site_type").notNull(),
  siteSlug: text("site_slug").unique(),
  config: jsonb("config").$type<SiteGeneratorConfig>().notNull(),
  html: text("html").notNull(),
  published: boolean("published").notNull().default(false),
  // D-005: análise de SEO/legibilidade/qualidade -- mesmo espírito do
  // checklist do Content Autopilot (Otimizador), adaptado pra HTML de
  // página em vez de markdown de artigo de blog.
  seoScore: integer("seo_score"),
  seoChecklist: jsonb("seo_checklist").$type<SiteSeoChecklist>(),
  analisadoEm: timestamp("analisado_em"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertGeneratedSiteSchema = createInsertSchema(generatedSitesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const updateGeneratedSiteSchema = createSelectSchema(generatedSitesTable)
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertGeneratedSite = z.infer<typeof insertGeneratedSiteSchema>;
export type UpdateGeneratedSite = z.infer<typeof updateGeneratedSiteSchema>;
export type GeneratedSite = typeof generatedSitesTable.$inferSelect;
