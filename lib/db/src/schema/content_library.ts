import { pgTable, text, timestamp, jsonb, boolean, integer } from "drizzle-orm/pg-core";
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

  // Sales Enablement: metadata used by Vendi to plan, generate and select
  // the right commercial asset for each prospect context.
  commercialUse: boolean("commercial_use").notNull().default(false),
  products: jsonb("products").$type<Array<"vendorai" | "arqdor">>().notNull().default([]),
  segments: jsonb("segments").$type<string[]>().notNull().default([]),
  personas: jsonb("personas").$type<string[]>().notNull().default([]),
  pains: jsonb("pains").$type<string[]>().notNull().default([]),
  prospectStages: jsonb("prospect_stages").$type<string[]>().notNull().default([]),
  objectives: jsonb("objectives").$type<string[]>().notNull().default([]),
  channels: jsonb("channels").$type<string[]>().notNull().default([]),
  autoSendAllowed: boolean("auto_send_allowed").notNull().default(false),
  approvalStatus: text("approval_status").$type<"draft" | "review" | "approved" | "rejected">().notNull().default("draft"),
  contentVersion: integer("content_version").notNull().default(1),
  validFrom: timestamp("valid_from"),
  validUntil: timestamp("valid_until"),
  generatedByAi: boolean("generated_by_ai").notNull().default(false),
  generationContext: jsonb("generation_context").$type<Record<string, unknown>>().notNull().default({}),

  savedAt: timestamp("saved_at").notNull().defaultNow(),
});

export const selectContentLibrarySchema = createSelectSchema(contentLibraryTable);
export type ContentLibraryItem = typeof contentLibraryTable.$inferSelect;
