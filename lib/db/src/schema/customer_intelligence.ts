import { pgTable, text, timestamp, integer, jsonb, boolean, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";

export const customerIntelligenceTable = pgTable("customer_intelligence", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id")
    .notNull()
    .unique()
    .references(() => leadsTable.id, { onDelete: "cascade" }),
  behaviorScore: jsonb("behavior_score").$type<Record<string, unknown>>(),
  intentAnalysis: text("intent_analysis"),
  goalAnalysis: text("goal_analysis"),
  journeyStage: text("journey_stage"),
  opportunities: jsonb("opportunities").$type<unknown[]>(),
  churnRisk: integer("churn_risk"),
  churnReasons: jsonb("churn_reasons").$type<unknown[]>(),
  nextBestAction: text("next_best_action"),
  nextBestActionReason: text("next_best_action_reason"),
  scoreExplicacao: text("score_explicacao"),
  churnRiskExplicacao: text("churn_risk_explicacao"),

  // Customer Intelligence V2 — saúde do relacionamento é o indicador canônico.
  // churnRisk permanece por compatibilidade com regras/relatórios legados.
  healthScore: integer("health_score"),
  healthStatus: text("health_status").$type<"saudavel" | "atencao" | "alto_risco" | "critico">(),
  riskType: text("risk_type").$type<"perda_comercial" | "churn" | "operacional" | "insatisfacao" | "desengajamento" | "financeiro" | "nenhum">(),
  riskLevel: text("risk_level").$type<"baixo" | "atencao" | "alto" | "critico">(),
  riskTrend: text("risk_trend").$type<"melhorando" | "estavel" | "piorando">(),
  analysisConfidence: integer("analysis_confidence"),
  healthDimensions: jsonb("health_dimensions").$type<Record<string, number>>(),
  positiveSignals: jsonb("positive_signals").$type<Array<Record<string, unknown>>>(),
  negativeSignals: jsonb("negative_signals").$type<Array<Record<string, unknown>>>(),
  riskFactors: jsonb("risk_factors").$type<Array<Record<string, unknown>>>(),
  riskEvents: jsonb("risk_events").$type<Array<Record<string, unknown>>>(),
  analysisVersion: integer("analysis_version").notNull().default(1),

  churnReasonsEditedBy: text("churn_reasons_edited_by").$type<"ai" | "rep">(),
  churnReasonsEditedAt: timestamp("churn_reasons_edited_at"),
  lastAnalyzedAt: timestamp("last_analyzed_at"),
  /**
   * Cross-process analysis lock. Set to true at the start of an analysis run
   * and false in a finally block. The in-process Set is a fast first check;
   * this column is the authoritative cross-instance guard.
   */
  isAnalyzing: boolean("is_analyzing").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  check("churn_risk_range", sql`${table.churnRisk} >= 0 AND ${table.churnRisk} <= 100`),
  check("health_score_range", sql`${table.healthScore} >= 0 AND ${table.healthScore} <= 100`),
  check("analysis_confidence_range", sql`${table.analysisConfidence} >= 0 AND ${table.analysisConfidence} <= 100`),
]);

export const insertCustomerIntelligenceSchema = createInsertSchema(
  customerIntelligenceTable,
  {
    lastAnalyzedAt: z.coerce.date().optional(),
    churnRisk: z.number().int().min(0).max(100).optional(),
    healthScore: z.number().int().min(0).max(100).optional(),
    analysisConfidence: z.number().int().min(0).max(100).optional(),
    churnReasonsEditedBy: z.enum(["ai", "rep"]).nullable().optional(),
    churnReasonsEditedAt: z.coerce.date().optional(),
  }
).omit({ id: true, createdAt: true, updatedAt: true });

export const updateCustomerIntelligenceSchema = createSelectSchema(
  customerIntelligenceTable,
  {
    lastAnalyzedAt: z.coerce.date().optional(),
    churnRisk: z.number().int().min(0).max(100).optional(),
    healthScore: z.number().int().min(0).max(100).optional(),
    analysisConfidence: z.number().int().min(0).max(100).optional(),
    churnReasonsEditedBy: z.enum(["ai", "rep"]).nullable().optional(),
    churnReasonsEditedAt: z.coerce.date().optional(),
    nextBestAction: z.string().max(300).nullable().optional(),
  }
)
  .omit({ id: true, tenantId: true, leadId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertCustomerIntelligence = z.infer<typeof insertCustomerIntelligenceSchema>;
export type UpdateCustomerIntelligence = z.infer<typeof updateCustomerIntelligenceSchema>;
export type CustomerIntelligence = typeof customerIntelligenceTable.$inferSelect;
