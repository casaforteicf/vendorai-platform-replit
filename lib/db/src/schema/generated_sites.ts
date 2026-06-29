import { pgTable, text, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
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
  config: jsonb("config").$type<SiteGeneratorConfig>().notNull(),
  html: text("html").notNull(),
  published: boolean("published").notNull().default(false),
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
