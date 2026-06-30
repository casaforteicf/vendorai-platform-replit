import {
  pgTable,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { archProjetosTable } from "./arch_projetos";
import { tenantsTable } from "./tenants";

export const archSuggestionsTable = pgTable("arch_suggestions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  projectId: text("project_id")
    .references(() => archProjetosTable.id, { onDelete: "set null" }),
  style:     text("style").notNull(),
  imageUrl:  text("image_url").notNull(),
  saved:     boolean("saved").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertArchSuggestionSchema = createInsertSchema(archSuggestionsTable)
  .omit({ id: true, createdAt: true });

export type InsertArchSuggestion = z.infer<typeof insertArchSuggestionSchema>;
export type ArchSuggestion = typeof archSuggestionsTable.$inferSelect;
