// ─── Vendor Certified Network — Knowledge Base ────────────────────────────────
// Documents uploaded by certified companies to power their Digital Specialists.

import { pgTable, text, boolean, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vcnCompaniesTable } from "./vcn_companies";

export const VCN_DOCUMENT_TYPES = [
  "PDF", "CATALOG", "MANUAL", "NORM", "BIM", "PBR", "TEXTURE",
  "VIDEO", "FAQ", "SPEC_SHEET", "PRESENTATION", "SPREADSHEET", "OTHER",
] as const;

export const vcnKnowledgeTable = pgTable("vcn_knowledge", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  companyId: text("company_id")
    .notNull()
    .references(() => vcnCompaniesTable.id, { onDelete: "cascade" }),

  type:        text("type").notNull().default("PDF"),
  title:       text("title").notNull(),
  description: text("description"),
  fileUrl:     text("file_url"),
  fileSize:    integer("file_size"),  // bytes
  mimeType:    text("mime_type"),

  // Related products
  productSkus: jsonb("product_skus").$type<string[]>().default([]),
  tags:        jsonb("tags").$type<string[]>().default([]),

  // For AI indexing
  indexed:     boolean("indexed").notNull().default(false),
  indexedAt:   timestamp("indexed_at"),
  chunkCount:  integer("chunk_count"),

  published:  boolean("published").notNull().default(true),
  language:   text("language").default("pt-BR"),
  version:    text("version"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_vcn_knowledge_company").on(t.companyId),
  index("idx_vcn_knowledge_type").on(t.type),
]);

export const insertVcnKnowledgeSchema = createInsertSchema(vcnKnowledgeTable, {
  title:       z.string().min(1).max(255),
  type:        z.enum(VCN_DOCUMENT_TYPES).optional(),
  productSkus: z.array(z.string()).optional(),
  tags:        z.array(z.string()).optional(),
  fileSize:    z.number().int().positive().optional(),
  chunkCount:  z.number().int().nonnegative().optional(),
});

export const selectVcnKnowledgeSchema = createSelectSchema(vcnKnowledgeTable, {
  productSkus: z.array(z.string()),
  tags:        z.array(z.string()),
});

export type VcnKnowledgeDoc       = typeof vcnKnowledgeTable.$inferSelect;
export type InsertVcnKnowledgeDoc = typeof vcnKnowledgeTable.$inferInsert;
