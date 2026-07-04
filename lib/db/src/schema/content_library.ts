import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import type { ContentType, ContentVariation } from "./content_generations";

export const contentLibraryTable = pgTable("content_library", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull(),
  type: text("type").notNull().$type<ContentType>(),
  variation: jsonb("variation").notNull().$type<ContentVariation>(),
  theme: text("theme"),
  title: text("title"),
  savedAt: timestamp("saved_at").notNull().defaultNow(),
});

export const selectContentLibrarySchema = createSelectSchema(contentLibraryTable);
export type ContentLibraryItem = typeof contentLibraryTable.$inferSelect;
