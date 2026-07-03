// ─── Project Opportunity Engine — Opportunities ───────────────────────────────
// FASE 23. Detected commercial opportunities from project analysis.

import { pgTable, text, boolean, timestamp, jsonb, integer, numeric, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const POE_OPPORTUNITY_STATUS = [
  "detected", "analyzing", "ready", "quoted", "closed", "dismissed",
] as const;

export const POE_OPPORTUNITY_TYPES = [
  "missing_item",       // Item não especificado no projeto
  "missing_supplier",   // Item sem fornecedor
  "incompatible_item",  // Item incompatível detectado
  "cross_sell",         // Produto complementar
  "up_sell",            // Alternativa superior
  "missing_category",   // Categoria não coberta
  "substitutable_item", // Item substituível com vantagem
] as const;

export const poeOpportunitiesTable = pgTable("poe_opportunities", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  tenantId:   text("tenant_id").notNull(),
  projectId:  text("project_id"),   // FK to arch_projects (optional)
  projectName: text("project_name"),

  type:        text("type").notNull().default("missing_item"),
  status:      text("status").notNull().default("detected"),
  priority:    integer("priority").notNull().default(5),  // 1-10

  // What was detected
  title:       text("title").notNull(),
  description: text("description"),
  environment: text("environment"),   // e.g. "Cozinha", "Banheiro"
  category:    text("category"),      // e.g. "Marcenaria", "Pedras"
  itemRef:     text("item_ref"),      // original AQM item id/sku

  // Justification (always required)
  justification: text("justification"),
  technicalBasis: jsonb("technical_basis").$type<string[]>().default([]),

  // Metadata
  tags:        jsonb("tags").$type<string[]>().default([]),
  aiGenerated: boolean("ai_generated").notNull().default(false),
  dismissed:   boolean("dismissed").notNull().default(false),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_poe_opportunities_tenant").on(t.tenantId),
  index("idx_poe_opportunities_project").on(t.projectId),
  index("idx_poe_opportunities_status").on(t.status),
]);

export const insertPoeOpportunitySchema = createInsertSchema(poeOpportunitiesTable, {
  tenantId:       z.string().min(1),
  title:          z.string().min(1).max(255),
  type:           z.enum(POE_OPPORTUNITY_TYPES).optional(),
  status:         z.enum(POE_OPPORTUNITY_STATUS).optional(),
  priority:       z.number().int().min(1).max(10).optional(),
  technicalBasis: z.array(z.string()).optional(),
  tags:           z.array(z.string()).optional(),
});

export const selectPoeOpportunitySchema = createSelectSchema(poeOpportunitiesTable, {
  technicalBasis: z.array(z.string()),
  tags:           z.array(z.string()),
});

export type PoeOpportunity       = typeof poeOpportunitiesTable.$inferSelect;
export type InsertPoeOpportunity = typeof poeOpportunitiesTable.$inferInsert;
