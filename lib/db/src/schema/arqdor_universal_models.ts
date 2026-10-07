import {
  pgTable,
  text,
  jsonb,
  numeric,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export type ArqdorUniversalModelKind =
  | "pre_project"
  | "facade"
  | "roof"
  | "opening"
  | "room"
  | "complete_project";

export const arqdorUniversalModelsTable = pgTable(
  "arqdor_universal_models",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    kind: text("kind").$type<ArqdorUniversalModelKind>().notNull(),
    title: text("title").notNull(),
    description: text("description"),
    sourceProjectId: text("source_project_id"),
    sourceTenantId: text("source_tenant_id").references(() => tenantsTable.id, { onDelete: "set null" }),
    sourceFileName: text("source_file_name"),
    architecture: jsonb("architecture").$type<Record<string, unknown>>().notNull().default({}),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    provenance: jsonb("provenance").$type<Record<string, unknown>>().notNull().default({}),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull().default("0"),
    dedupeKey: text("dedupe_key").notNull().unique(),
    status: text("status").notNull().default("ready"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("arqdor_universal_models_kind_idx").on(table.kind, table.isActive),
    index("arqdor_universal_models_source_project_idx").on(table.sourceProjectId),
  ],
);

export type ArqdorUniversalModel = typeof arqdorUniversalModelsTable.$inferSelect;
export type InsertArqdorUniversalModel = typeof arqdorUniversalModelsTable.$inferInsert;
