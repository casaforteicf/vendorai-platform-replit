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

export interface SiteGeneratorDesignQa {
  brandScore: number;
  readabilityScore: number;
  compositionScore: number;
  channelFitScore: number;
  ctaScore: number;
  technicalScore: number;
  overallScore: number;
  approved: boolean;
  warnings: string[];
  recommendations: string[];
}

export interface SiteCommerceOffer {
  enabled: boolean;
  offerCode?: string;
  planSlug: string;
  vertical?: string;
  headline?: string;
  promotionalPriceCents?: number;
  regularPriceOverrideCents?: number;
  originalPriceCents?: number;
  promotionalCycles?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  couponsAllowed?: boolean;
  partnerRulesAllowed?: boolean;
  billingCycle?: "monthly" | "annual";
  renewalMode?: "catalog" | "fixed";
}

export interface SiteGeneratorConfig {
  type: "landing" | "ecommerce" | "institutional" | "product";
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
  headline?: string;
  videos?: string[];
  servicos?: string;
  nicheId?: string;
  nicheName?: string;
  productIds?: string[];
  productNames?: string[];
  campaignId?: string;
  campaignName?: string;
  commerceOffer?: SiteCommerceOffer;
  marketingContext?: Record<string, unknown>;
  creativeRuntimeContext?: string;
  designQa?: SiteGeneratorDesignQa;
  qaReviewedAt?: string;
  qaApprovedAt?: string | null;
  qaSource?: "generation" | "refine" | "manual" | "publish-gate" | "marketing-agent";
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
