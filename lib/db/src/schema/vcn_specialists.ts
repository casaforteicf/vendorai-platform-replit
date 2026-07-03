// ─── Vendor Certified Network — Digital Specialists ──────────────────────────
// Official digital specialists per certified company.
// NOT sold — they support product sales by answering from official knowledge.

import { pgTable, text, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vcnCompaniesTable } from "./vcn_companies";

export const VCN_SPECIALIST_TYPES = [
  "TECHNICAL", "COMMERCIAL", "INSTALLATION", "AFTER_SALES",
  "WARRANTY", "PROJECTS", "GENERAL",
] as const;

export const vcnSpecialistsTable = pgTable("vcn_specialists", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  companyId: text("company_id")
    .notNull()
    .references(() => vcnCompaniesTable.id, { onDelete: "cascade" }),

  // Identity
  name:        text("name").notNull(),
  specialistType: text("specialist_type").notNull().default("GENERAL"),
  avatarUrl:   text("avatar_url"),
  description: text("description"),

  // Knowledge base config (for AI)
  systemPrompt:     text("system_prompt"),
  knowledgeTopics:  jsonb("knowledge_topics").$type<string[]>().default([]),
  languages:        jsonb("languages").$type<string[]>().default(["pt-BR"]),
  responseStyle:    text("response_style").default("professional"),

  // Integration
  agentConfigId: text("agent_config_id"),  // FK to agent_configs if wired

  active:    boolean("active").notNull().default(true),
  featured:  boolean("featured").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_vcn_specialists_company").on(t.companyId),
]);

export const insertVcnSpecialistSchema = createInsertSchema(vcnSpecialistsTable, {
  name:            z.string().min(2).max(255),
  specialistType:  z.enum(VCN_SPECIALIST_TYPES).optional(),
  knowledgeTopics: z.array(z.string()).optional(),
  languages:       z.array(z.string()).optional(),
});

export const selectVcnSpecialistSchema = createSelectSchema(vcnSpecialistsTable, {
  knowledgeTopics: z.array(z.string()),
  languages:       z.array(z.string()),
});

export type VcnSpecialist       = typeof vcnSpecialistsTable.$inferSelect;
export type InsertVcnSpecialist = typeof vcnSpecialistsTable.$inferInsert;
