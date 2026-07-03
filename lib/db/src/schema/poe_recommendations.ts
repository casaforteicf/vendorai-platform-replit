// ─── Project Opportunity Engine — Recommendations ────────────────────────────
// Product/supplier recommendations for each detected opportunity.
// Each recommendation must include a technical justification.

import { pgTable, text, boolean, timestamp, jsonb, integer, numeric, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { poeOpportunitiesTable } from "./poe_opportunities";

export const poeRecommendationsTable = pgTable("poe_recommendations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  opportunityId: text("opportunity_id")
    .notNull()
    .references(() => poeOpportunitiesTable.id, { onDelete: "cascade" }),

  // What is being recommended
  vcnCompanyId: text("vcn_company_id"),   // FK to vcn_companies (optional)
  vcnProductId: text("vcn_product_id"),   // FK to vcn_products (optional)
  companyName:  text("company_name"),
  productName:  text("product_name"),
  productSku:   text("product_sku"),

  // Compatibility scores (0-100)
  scoreTechnical:   integer("score_technical"),   // Compatibilidade Técnica
  scoreAesthetic:   integer("score_aesthetic"),   // Compatibilidade Estética
  scoreDimensional: integer("score_dimensional"), // Compatibilidade Dimensional
  scoreFinancial:   integer("score_financial"),   // Compatibilidade Financeira
  scoreRegional:    integer("score_regional"),    // Disponibilidade Regional
  scoreLeadTime:    integer("score_lead_time"),   // Lead Time
  scoreOverall:     integer("score_overall"),     // Score composto (média ponderada)

  // Justification (mandatory)
  justification:  text("justification").notNull(),
  advantages:     jsonb("advantages").$type<string[]>().default([]),
  caveats:        jsonb("caveats").$type<string[]>().default([]),   // Ressalvas

  // Commercial
  estimatedPrice:   numeric("estimated_price", { precision: 12, scale: 2 }),
  priceUnit:        text("price_unit"),
  leadTimeDays:     integer("lead_time_days"),
  inStock:          boolean("in_stock"),
  region:           text("region"),

  // Status
  selected:  boolean("selected").notNull().default(false),   // arquiteto escolheu
  dismissed: boolean("dismissed").notNull().default(false),
  rank:      integer("rank").notNull().default(1),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_poe_recs_opportunity").on(t.opportunityId),
  index("idx_poe_recs_company").on(t.vcnCompanyId),
]);

export const insertPoeRecommendationSchema = createInsertSchema(poeRecommendationsTable, {
  opportunityId: z.string().min(1),
  justification: z.string().min(1),
  advantages:    z.array(z.string()).optional(),
  caveats:       z.array(z.string()).optional(),
  scoreTechnical:   z.number().int().min(0).max(100).optional(),
  scoreAesthetic:   z.number().int().min(0).max(100).optional(),
  scoreDimensional: z.number().int().min(0).max(100).optional(),
  scoreFinancial:   z.number().int().min(0).max(100).optional(),
  scoreRegional:    z.number().int().min(0).max(100).optional(),
  scoreLeadTime:    z.number().int().min(0).max(100).optional(),
  scoreOverall:     z.number().int().min(0).max(100).optional(),
  estimatedPrice:   z.string().optional(),
  leadTimeDays:     z.number().int().positive().optional(),
  rank:             z.number().int().positive().optional(),
});

export const selectPoeRecommendationSchema = createSelectSchema(poeRecommendationsTable, {
  advantages: z.array(z.string()),
  caveats:    z.array(z.string()),
});

export type PoeRecommendation       = typeof poeRecommendationsTable.$inferSelect;
export type InsertPoeRecommendation = typeof poeRecommendationsTable.$inferInsert;
