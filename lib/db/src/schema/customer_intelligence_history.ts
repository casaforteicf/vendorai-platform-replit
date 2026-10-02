import { pgTable, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";
import { dealsTable } from "./deals";
import { customerIntelligenceTable } from "./customer_intelligence";

export type IntelligenceFactKind =
  | "fato_confirmado"
  | "declaracao_cliente"
  | "evento_operacional"
  | "inferencia_ia";

export const customerIntelligenceSourcesTable = pgTable("customer_intelligence_sources", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(),
  sourceModule: text("source_module").notNull(),
  sourceId: text("source_id"),
  sourceUrl: text("source_url"),
  title: text("title"),
  capturedAt: timestamp("captured_at").notNull().defaultNow(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("ci_sources_tenant_lead_idx").on(table.tenantId, table.leadId, table.capturedAt),
]);

export const customerIntelligenceFactsTable = pgTable("customer_intelligence_facts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  intelligenceId: text("intelligence_id").references(() => customerIntelligenceTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().$type<IntelligenceFactKind>(),
  factKey: text("fact_key").notNull(),
  value: jsonb("value").notNull().$type<unknown>(),
  confidence: integer("confidence"),
  sourceId: text("source_id").references(() => customerIntelligenceSourcesTable.id, { onDelete: "set null" }),
  validFrom: timestamp("valid_from"),
  validTo: timestamp("valid_to"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("ci_facts_tenant_lead_idx").on(table.tenantId, table.leadId, table.factKey),
]);

export const customerIntelligenceEventsTable = pgTable("customer_intelligence_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  title: text("title").notNull(),
  summary: text("summary"),
  sourceModule: text("source_module"),
  sourceId: text("source_id"),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("ci_events_tenant_lead_time_idx").on(table.tenantId, table.leadId, table.occurredAt),
]);

export const customerIntelligenceSnapshotsTable = pgTable("customer_intelligence_snapshots", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  intelligenceId: text("intelligence_id").references(() => customerIntelligenceTable.id, { onDelete: "cascade" }),
  healthScore: integer("health_score"),
  riskType: text("risk_type"),
  riskLevel: text("risk_level"),
  riskTrend: text("risk_trend"),
  analysisConfidence: integer("analysis_confidence"),
  payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("ci_snapshots_tenant_lead_time_idx").on(table.tenantId, table.leadId, table.createdAt),
]);

export const leadStageDynamicQuestionsTable = pgTable("lead_stage_dynamic_questions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  dealId: text("deal_id").references(() => dealsTable.id, { onDelete: "cascade" }),
  stageKey: text("stage_key").notNull(),
  questionText: text("question_text").notNull(),
  objective: text("objective"),
  status: text("status").notNull().default("pendente").$type<"pendente" | "respondida" | "descartada">(),
  answer: text("answer"),
  source: text("source").notNull().default("ai").$type<"ai" | "humano">(),
  confidence: integer("confidence"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  answeredAt: timestamp("answered_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("lead_stage_dynamic_questions_lookup_idx").on(table.tenantId, table.leadId, table.stageKey, table.status),
]);
