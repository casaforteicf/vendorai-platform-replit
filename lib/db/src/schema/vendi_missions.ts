import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const vendiMissionsTable = pgTable("vendi_missions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  source: text("source").notNull().default("user"),
  sourceRefId: text("source_ref_id"),
  objective: text("objective").notNull(),
  status: text("status").notNull().default("planning"),
  priority: integer("priority").notNull().default(50),
  riskPolicy: text("risk_policy").notNull().default("standard"),
  plan: jsonb("plan").$type<Array<Record<string, unknown>>>().notNull().default([]),
  context: jsonb("context").$type<Record<string, unknown> | null>(),
  successCriteria: jsonb("success_criteria").$type<Array<string>>().notNull().default([]),
  result: jsonb("result").$type<Record<string, unknown> | null>(),
  lastError: text("last_error"),
  createdByUserId: text("created_by_user_id"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
}, (table) => ({
  tenantStatusIdx: index("vendi_missions_tenant_status_idx").on(table.tenantId, table.status),
  tenantCreatedIdx: index("vendi_missions_tenant_created_idx").on(table.tenantId, table.createdAt),
}));

export const vendiMissionEventsTable = pgTable("vendi_mission_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  missionId: text("mission_id").notNull().references(() => vendiMissionsTable.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  type: text("type").notNull(),
  toolId: text("tool_id"),
  status: text("status").notNull().default("recorded"),
  input: jsonb("input").$type<Record<string, unknown> | null>(),
  output: jsonb("output").$type<Record<string, unknown> | null>(),
  error: text("error"),
  evidence: jsonb("evidence").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  missionSequenceIdx: index("vendi_mission_events_mission_sequence_idx").on(table.missionId, table.sequence),
  tenantCreatedIdx: index("vendi_mission_events_tenant_created_idx").on(table.tenantId, table.createdAt),
}));
