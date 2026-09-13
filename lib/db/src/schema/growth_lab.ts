import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const growthLabPromisesTable = pgTable("growth_lab_promises", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  promise: text("promise").notNull(),
  lpName: text("lp_name").notNull().default("Nova promessa"),
  lpPath: text("lp_path"),
  source: text("source").notNull().default("manual"),
  capabilityIds: jsonb("capability_ids").$type<string[]>().notNull().default([]),
  coverage: integer("coverage").notNull().default(0),
  status: text("status").notNull().default("review"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  tenantCreatedIdx: index("growth_lab_promises_tenant_created_idx").on(table.tenantId, table.createdAt),
  tenantStatusIdx: index("growth_lab_promises_tenant_status_idx").on(table.tenantId, table.status),
}));

export const growthLabBacklogTable = pgTable("growth_lab_backlog", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  capabilityId: text("capability_id").notNull(),
  capabilityName: text("capability_name").notNull(),
  module: text("module").notNull(),
  currentStatus: text("current_status").notNull().default("missing"),
  affectedPromises: integer("affected_promises").notNull().default(0),
  priorityScore: integer("priority_score").notNull().default(0),
  action: text("action").notNull().default("complete_product"),
  state: text("state").notNull().default("open"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  tenantCapabilityUq: uniqueIndex("growth_lab_backlog_tenant_capability_uq").on(table.tenantId, table.capabilityId),
  tenantPriorityIdx: index("growth_lab_backlog_tenant_priority_idx").on(table.tenantId, table.priorityScore, table.createdAt),
}));

export type GrowthLabPromise = typeof growthLabPromisesTable.$inferSelect;
export type InsertGrowthLabPromise = typeof growthLabPromisesTable.$inferInsert;
export type GrowthLabBacklogItem = typeof growthLabBacklogTable.$inferSelect;
export type InsertGrowthLabBacklogItem = typeof growthLabBacklogTable.$inferInsert;
