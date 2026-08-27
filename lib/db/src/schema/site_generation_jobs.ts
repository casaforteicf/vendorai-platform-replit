import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import type { SiteGeneratorConfig } from "./generated_sites";

export const siteGenerationJobsTable = pgTable("site_generation_jobs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  config: jsonb("config").$type<SiteGeneratorConfig>().notNull(),
  baseOrigin: text("base_origin").notNull(),
  result: jsonb("result").$type<Record<string, unknown>>(),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
