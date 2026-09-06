import { pgTable, text, timestamp, integer, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const jarvisCasesTable = pgTable("jarvis_cases", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  signalKey: text("signal_key").notNull(),
  source: text("source").notNull().default("internal"),
  category: text("category").notNull(),
  severity: text("severity").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  metric: text("metric"),
  confidence: integer("confidence"),
  impact: integer("impact"),
  href: text("href"),
  status: text("status").notNull().default("open"),
  evidence: jsonb("evidence").$type<Record<string, unknown> | null>(),
  recommendedAction: text("recommended_action"),
  resultSummary: text("result_summary"),
  firstDetectedAt: timestamp("first_detected_at", { withTimezone: true }).notNull().defaultNow(),
  lastDetectedAt: timestamp("last_detected_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
}, (table) => ({
  tenantSignalUnique: uniqueIndex("jarvis_cases_tenant_signal_idx").on(table.tenantId, table.signalKey),
  tenantUpdatedIdx: index("jarvis_cases_tenant_updated_idx").on(table.tenantId, table.updatedAt),
}));
