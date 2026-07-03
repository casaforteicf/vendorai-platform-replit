// ─── Vendor Ecosystem Platform — Portfolio Items ─────────────────────────────
// Projects, renders, photos, case studies published by companies.

import { pgTable, text, boolean, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vepCompaniesTable } from "./vep_companies";

export const VEP_PORTFOLIO_TYPES = [
  "PROJECT", "PHOTO", "VIDEO", "RENDER", "BIM",
  "COMPONENT", "TEMPLATE", "CASE_STUDY", "CATALOG", "OTHER",
] as const;

export const vepPortfolioTable = pgTable("vep_portfolio", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  companyId: text("company_id")
    .notNull()
    .references(() => vepCompaniesTable.id, { onDelete: "cascade" }),

  type:        text("type").notNull().default("PROJECT"),
  title:       text("title").notNull(),
  description: text("description"),
  coverUrl:    text("cover_url"),
  mediaUrls:   jsonb("media_urls").$type<string[]>().default([]),

  // Metadata
  tags:        jsonb("tags").$type<string[]>().default([]),
  style:       text("style"),     // Japandi, Minimalista, etc.
  area:        integer("area"),   // m²
  year:        integer("year"),
  city:        text("city"),
  state:       text("state"),

  // Partners involved (other companies)
  partnerIds:  jsonb("partner_ids").$type<string[]>().default([]),

  // Stats
  viewsCount:    integer("views_count").notNull().default(0),
  likesCount:    integer("likes_count").notNull().default(0),
  savesCount:    integer("saves_count").notNull().default(0),

  published: boolean("published").notNull().default(true),
  featured:  boolean("featured").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_vep_portfolio_company").on(t.companyId),
  index("idx_vep_portfolio_type").on(t.type),
]);

export const insertVepPortfolioSchema = createInsertSchema(vepPortfolioTable, {
  title:      z.string().min(1).max(255),
  type:       z.enum(VEP_PORTFOLIO_TYPES).optional(),
  mediaUrls:  z.array(z.string()).optional(),
  tags:       z.array(z.string()).optional(),
  partnerIds: z.array(z.string()).optional(),
  area:       z.number().int().positive().optional(),
  year:       z.number().int().min(1900).max(2100).optional(),
});

export const selectVepPortfolioSchema = createSelectSchema(vepPortfolioTable, {
  mediaUrls:  z.array(z.string()),
  tags:       z.array(z.string()),
  partnerIds: z.array(z.string()),
});

export type VepPortfolioItem       = typeof vepPortfolioTable.$inferSelect;
export type InsertVepPortfolioItem = typeof vepPortfolioTable.$inferInsert;
