import {
  pgTable,
  text,
  varchar,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const archPromptVariationsTable = pgTable("arch_prompt_variations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  userId:          text("user_id").notNull(),
  name:            varchar("name", { length: 200 }).notNull(),
  translator:      varchar("translator", { length: 50 }).notNull(),
  detail:          varchar("detail", { length: 50 }).notNull(),
  prompt:          text("prompt").notNull(),
  negativePrompt:  text("negative_prompt").notNull().default(""),
  estimatedTokens: integer("estimated_tokens").notNull().default(0),
  notes:           text("notes"),
  savedAt:         timestamp("saved_at").notNull().defaultNow(),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
});

export const insertArchPromptVariationSchema = createInsertSchema(archPromptVariationsTable, {
  name:            z.string().min(1).max(200),
  translator:      z.string().min(1).max(50),
  detail:          z.string().min(1).max(50),
  prompt:          z.string(),
  negativePrompt:  z.string().optional(),
  estimatedTokens: z.number().int().min(0).optional(),
  notes:           z.string().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateArchPromptVariationSchema = createSelectSchema(archPromptVariationsTable)
  .pick({ name: true, notes: true })
  .partial();

export type InsertArchPromptVariation = z.infer<typeof insertArchPromptVariationSchema>;
export type UpdateArchPromptVariation = z.infer<typeof updateArchPromptVariationSchema>;
export type ArchPromptVariation = typeof archPromptVariationsTable.$inferSelect;
