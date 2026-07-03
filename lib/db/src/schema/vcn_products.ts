// ─── Vendor Certified Network — Product Catalog ───────────────────────────────
// Official product catalog for certified companies.

import { pgTable, text, boolean, timestamp, jsonb, integer, numeric, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vcnCompaniesTable } from "./vcn_companies";

export const vcnProductsTable = pgTable("vcn_products", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  companyId: text("company_id")
    .notNull()
    .references(() => vcnCompaniesTable.id, { onDelete: "cascade" }),

  // Product identity
  name:        text("name").notNull(),
  line:        text("line"),       // product line/family
  model:       text("model"),
  sku:         text("sku"),
  description: text("description"),
  coverUrl:    text("cover_url"),
  imageUrls:   jsonb("image_urls").$type<string[]>().default([]),

  // Technical specs
  finishes:      jsonb("finishes").$type<string[]>().default([]),   // acabamentos
  colors:        jsonb("colors").$type<string[]>().default([]),
  materials:     jsonb("materials").$type<string[]>().default([]),
  dimensions:    jsonb("dimensions").$type<Record<string, string>>().default({}),
  compatibility: jsonb("compatibility").$type<string[]>().default([]),
  relatedSkus:   jsonb("related_skus").$type<string[]>().default([]),
  specs:         jsonb("specs").$type<Record<string, string>>().default({}),

  // Digital assets
  bimUrls:     jsonb("bim_urls").$type<string[]>().default([]),
  cadUrls:     jsonb("cad_urls").$type<string[]>().default([]),
  pbrUrls:     jsonb("pbr_urls").$type<string[]>().default([]),
  textureUrls: jsonb("texture_urls").$type<string[]>().default([]),
  manualUrls:  jsonb("manual_urls").$type<string[]>().default([]),
  videoUrls:   jsonb("video_urls").$type<string[]>().default([]),

  // Commercial
  price:        numeric("price", { precision: 12, scale: 2 }),
  priceUnit:    text("price_unit"),  // m², un, ml, etc.
  inStock:      boolean("in_stock").notNull().default(true),
  leadTimeDays: integer("lead_time_days"),
  warrantyMonths: integer("warranty_months"),

  // Compliance
  norms:  jsonb("norms").$type<string[]>().default([]),   // ABNT, NBR, ISO
  certifications: jsonb("certifications").$type<string[]>().default([]),

  // Stats
  specificationsCount: integer("specifications_count").notNull().default(0),
  quotationsCount:     integer("quotations_count").notNull().default(0),
  viewsCount:          integer("views_count").notNull().default(0),

  published:  boolean("published").notNull().default(true),
  featured:   boolean("featured").notNull().default(false),
  category:   text("category"),
  tags:       jsonb("tags").$type<string[]>().default([]),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_vcn_products_company").on(t.companyId),
  index("idx_vcn_products_category").on(t.category),
]);

export const insertVcnProductSchema = createInsertSchema(vcnProductsTable, {
  name:          z.string().min(1).max(255),
  finishes:      z.array(z.string()).optional(),
  colors:        z.array(z.string()).optional(),
  materials:     z.array(z.string()).optional(),
  dimensions:    z.record(z.string(), z.string()).optional(),
  compatibility: z.array(z.string()).optional(),
  relatedSkus:   z.array(z.string()).optional(),
  specs:         z.record(z.string(), z.string()).optional(),
  bimUrls:       z.array(z.string()).optional(),
  cadUrls:       z.array(z.string()).optional(),
  pbrUrls:       z.array(z.string()).optional(),
  textureUrls:   z.array(z.string()).optional(),
  manualUrls:    z.array(z.string()).optional(),
  videoUrls:     z.array(z.string()).optional(),
  imageUrls:     z.array(z.string()).optional(),
  norms:         z.array(z.string()).optional(),
  certifications: z.array(z.string()).optional(),
  tags:          z.array(z.string()).optional(),
  price:         z.string().optional(),
  leadTimeDays:  z.number().int().positive().optional(),
  warrantyMonths: z.number().int().positive().optional(),
});

export const selectVcnProductSchema = createSelectSchema(vcnProductsTable, {
  finishes:       z.array(z.string()),
  colors:         z.array(z.string()),
  materials:      z.array(z.string()),
  dimensions:     z.record(z.string(), z.string()),
  compatibility:  z.array(z.string()),
  relatedSkus:    z.array(z.string()),
  specs:          z.record(z.string(), z.string()),
  bimUrls:        z.array(z.string()),
  cadUrls:        z.array(z.string()),
  pbrUrls:        z.array(z.string()),
  textureUrls:    z.array(z.string()),
  manualUrls:     z.array(z.string()),
  videoUrls:      z.array(z.string()),
  imageUrls:      z.array(z.string()),
  norms:          z.array(z.string()),
  certifications: z.array(z.string()),
  tags:           z.array(z.string()),
});

export type VcnProduct       = typeof vcnProductsTable.$inferSelect;
export type InsertVcnProduct = typeof vcnProductsTable.$inferInsert;
