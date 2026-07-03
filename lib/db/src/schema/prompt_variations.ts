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
import { usersTable } from "./users";

export const promptVariationsTable = pgTable("prompt_variations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  translator: varchar("translator", { length: 50 }).notNull(),
  detail: varchar("detail", { length: 50 }).notNull(),
  prompt: text("prompt").notNull(),
  negativePrompt: text("negative_prompt").notNull().default(""),
  estimatedTokens: integer("estimated_tokens").notNull().default(0),
  notes: text("notes"),
  savedAt: timestamp("saved_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPromptVariationSchema = createInsertSchema(
  promptVariationsTable,
  { savedAt: z.coerce.date().optional() },
).omit({ id: true, tenantId: true, userId: true, createdAt: true, updatedAt: true });

export const updatePromptVariationSchema = createSelectSchema(
  promptVariationsTable,
  { savedAt: z.coerce.date().optional() },
)
  .omit({ id: true, tenantId: true, userId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertPromptVariation = z.infer<typeof insertPromptVariationSchema>;
export type UpdatePromptVariation = z.infer<typeof updatePromptVariationSchema>;
export type PromptVariation = typeof promptVariationsTable.$inferSelect;
