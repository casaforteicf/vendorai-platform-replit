import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const jarvisMissionsTable = pgTable("jarvis_missions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  objective: text("objective").notNull(),
  status: text("status").notNull().default("active"),
  priority: integer("priority").notNull().default(50),
  successMetric: text("success_metric"),
  target: jsonb("target").$type<Record<string, unknown> | null>(),
  baseline: jsonb("baseline").$type<Record<string, unknown> | null>(),
  currentState: jsonb("current_state").$type<Record<string, unknown> | null>(),
  strategy: jsonb("strategy").$type<Record<string, unknown> | null>(),
  ownerUserId: text("owner_user_id"),
  createdByUserId: text("created_by_user_id"),
  deadlineAt: timestamp("deadline_at", { withTimezone: true }),
  lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
}, (table) => ({
  tenantStatusIdx: index("jarvis_missions_tenant_status_idx").on(table.tenantId, table.status),
  tenantPriorityIdx: index("jarvis_missions_tenant_priority_idx").on(table.tenantId, table.priority),
}));

export const jarvisDecisionsTable = pgTable("jarvis_decisions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  missionId: text("mission_id").references(() => jarvisMissionsTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  question: text("question"),
  decision: text("decision").notNull(),
  rationale: text("rationale"),
  confidence: integer("confidence"),
  alternatives: jsonb("alternatives").$type<Array<Record<string, unknown>> | null>(),
  evidence: jsonb("evidence").$type<Record<string, unknown> | null>(),
  expectedOutcome: text("expected_outcome"),
  successMetric: text("success_metric"),
  reviewAt: timestamp("review_at", { withTimezone: true }),
  actualOutcome: text("actual_outcome"),
  resultStatus: text("result_status").notNull().default("pending"),
  decidedByUserId: text("decided_by_user_id"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
}, (table) => ({
  tenantCreatedIdx: index("jarvis_decisions_tenant_created_idx").on(table.tenantId, table.createdAt),
  missionIdx: index("jarvis_decisions_mission_idx").on(table.missionId),
  reviewIdx: index("jarvis_decisions_review_idx").on(table.tenantId, table.reviewAt),
}));
